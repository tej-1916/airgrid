import os
import re
import shutil
import socket
import subprocess
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any, Tuple
import uuid
import ipaddress
import selectors
import time
from threading import Lock
from airgrid.core.config import settings

from airgrid.schemas.diagnostics import (
    InterfaceInfo,
    InterfaceListResponse,
    GatewayPingResult,
    IperfResult,
    TelemetrySnapshotResponse,
)


class TelemetryCollector:
    """
    Safe, opt-in Linux network telemetry collector for AirGrid.
    Uses read-only system tools (ip, iw, nmcli, ping) with strict timeouts,
    command whitelisting, and no packet-sniffing or configuration changes.
    """

    def __init__(self):
        self._iperf_lock = Lock()
        self.ip_bin = shutil.which("ip") or "/usr/bin/ip"
        self.iw_bin = shutil.which("iw") or "/usr/bin/iw"
        self.nmcli_bin = shutil.which("nmcli") or "/usr/bin/nmcli"
        self.ping_bin = shutil.which("ping") or "/usr/bin/ping"
        self.iperf_bin = shutil.which("iperf3")

    def _run_cmd(self, args: List[str], timeout: float = 3.0) -> Tuple[int, str, str]:
        """Run a whitelisted command safely without shell=True and with bounded timeout."""
        if args[0] not in {self.ip_bin, self.iw_bin, self.nmcli_bin, self.ping_bin, self.iperf_bin}:
            return -1, "", "Command not allowed"
        try:
            with subprocess.Popen(args, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                  env={**os.environ, "LC_ALL": "C"}) as proc:
                output = bytearray()
                deadline = time.monotonic() + timeout
                with selectors.DefaultSelector() as selector:
                    selector.register(proc.stdout, selectors.EVENT_READ)
                    while True:
                        remaining = deadline - time.monotonic()
                        if remaining <= 0 or not selector.select(remaining):
                            proc.kill()
                            proc.wait()
                            return -1, "", "Command timed out"
                        chunk = os.read(proc.stdout.fileno(), 4096)
                        if not chunk:
                            break
                        output.extend(chunk)
                        if len(output) > 65536:
                            proc.kill()
                            proc.wait()
                            return -1, "", "Command output limit exceeded"
                try:
                    proc.wait(timeout=max(0.01, deadline - time.monotonic()))
                except subprocess.TimeoutExpired:
                    proc.kill()
                    proc.wait()
                    return -1, "", "Command timed out"
                return proc.returncode, output.decode("utf-8", errors="replace").strip(), ""
        except (OSError, subprocess.TimeoutExpired):
            return -1, "", "Command unavailable or timed out"

    def discover_default_route(self) -> Tuple[Optional[str], Optional[str]]:
        """
        Extracts default gateway IP and default egress interface from `ip route show default`.
        Returns: (gateway_ip, interface_name)
        """
        code, out, _ = self._run_cmd([self.ip_bin, "route", "show", "default"])
        if code != 0 or not out:
            return None, None

        # Format: "default via 192.0.2.1 dev wifi0 proto dhcp metric 600"
        match = re.search(r"default via (\S+) dev (\S+)", out)
        if match:
            return match.group(1), match.group(2)
        return None, None

    def list_interfaces(self) -> InterfaceListResponse:
        """
        Discovers all local network interfaces and determines wireless capability.
        Automatically identifies the primary connected wireless device (not assuming wlan0).
        """
        interfaces: List[InterfaceInfo] = []
        default_gw, default_iface = self.discover_default_route()
        discovered_wireless: Optional[str] = None

        # 1. Use nmcli device status if available
        nmcli_devices: Dict[str, Dict[str, str]] = {}
        if os.path.exists(self.nmcli_bin):
            code, out, _ = self._run_cmd([self.nmcli_bin, "-t", "-f", "DEVICE,TYPE,STATE,CONNECTION", "device", "status"])
            if code == 0 and out:
                for line in out.splitlines():
                    parts = line.split(":")
                    if len(parts) >= 4:
                        dev, dev_type, state, conn = parts[0], parts[1], parts[2], parts[3]
                        nmcli_devices[dev] = {
                            "type": dev_type,
                            "state": state,
                            "connection": conn if conn != "--" else "",
                        }

        # 2. Check /sys/class/net for interfaces
        sys_net_path = "/sys/class/net"
        if os.path.isdir(sys_net_path):
            try:
                for iface in sorted(os.listdir(sys_net_path)):
                    # Check if wireless by /sys/class/net/<iface>/wireless directory or iw
                    is_wifi = False
                    if os.path.isdir(f"{sys_net_path}/{iface}/wireless") or os.path.isdir(f"{sys_net_path}/{iface}/phy80211"):
                        is_wifi = True
                    elif iface in nmcli_devices and nmcli_devices[iface]["type"] in ("wifi", "wireless"):
                        is_wifi = True

                    # Get operstate
                    operstate = "unknown"
                    state_file = f"{sys_net_path}/{iface}/operstate"
                    if os.path.isfile(state_file):
                        try:
                            with open(state_file, "r") as f:
                                operstate = f.read().strip()
                        except Exception:
                            pass

                    # Get MAC address
                    mac = None
                    addr_file = f"{sys_net_path}/{iface}/address"
                    if os.path.isfile(addr_file):
                        try:
                            with open(addr_file, "r") as f:
                                mac_val = f.read().strip()
                                if mac_val and mac_val != "00:00:00:00:00:00":
                                    mac = mac_val
                        except Exception:
                            pass

                    # Get IP address from `ip -o -4 addr show <iface>`
                    ip_addr = None
                    code, out, _ = self._run_cmd([self.ip_bin, "-o", "-4", "addr", "show", iface])
                    if code == 0 and out:
                        ip_match = re.search(r"inet (\d+\.\d+\.\d+\.\d+)", out)
                        if ip_match:
                            ip_addr = ip_match.group(1)

                    nm_info = nmcli_devices.get(iface, {})
                    dev_type = nm_info.get("type", "wifi" if is_wifi else ("loopback" if iface == "lo" else "ethernet"))
                    is_connected = operstate == "up" or nm_info.get("state") == "connected"
                    is_default = iface == default_iface

                    if is_wifi and is_connected and not discovered_wireless:
                        discovered_wireless = iface

                    interfaces.append(
                        InterfaceInfo(
                            name=iface,
                            type=dev_type,
                            is_wireless=is_wifi,
                            is_connected=is_connected,
                            ip_address=ip_addr,
                            mac_address=mac,
                            state=operstate,
                            connection_name=nm_info.get("connection"),
                            is_default_gateway_interface=is_default,
                        )
                    )
            except Exception as e:
                # Fallback list if sysfs read fails
                pass

        # If not yet found, check iw dev output
        if not discovered_wireless and os.path.exists(self.iw_bin):
            code, out, _ = self._run_cmd([self.iw_bin, "dev"])
            if code == 0 and out:
                iw_matches = re.findall(r"Interface\s+(\S+)", out)
                if iw_matches:
                    discovered_wireless = iw_matches[0]

        return InterfaceListResponse(
            interfaces=interfaces,
            discovered_wireless_interface=discovered_wireless,
            default_gateway=default_gw,
            hostname=socket.gethostname(),
            os_info=os.uname().sysname + " " + os.uname().release,
        )

    def collect_wireless_telemetry(self, target_iface: Optional[str] = None) -> Dict[str, Any]:
        """
        Reads genuine live Wi-Fi telemetry for the given or auto-discovered interface.
        Never fabricates values; returns None for missing/unavailable fields.
        """
        if not target_iface:
            info = self.list_interfaces()
            target_iface = info.discovered_wireless_interface

        if not target_iface:
            return {
                "error": "No wireless network interface detected on this system",
                "interface_name": "none",
            }

        if not re.fullmatch(r"[a-zA-Z0-9_][a-zA-Z0-9_.-]{0,14}", target_iface):
            return {"error": "Invalid interface name"}

        telemetry: Dict[str, Any] = {
            "interface_name": target_iface,
            "mac_address": None,
            "ssid": None,
            "bssid": None,
            "rssi_dbm": None,
            "signal_quality_pct": None,
            "frequency_mhz": None,
            "channel": None,
            "channel_width_mhz": None,
            "band": None,
            "rx_bitrate_mbps": None,
            "tx_bitrate_mbps": None,
            "security_protocol": None,
            "raw_details": {},
        }

        # 1. Get MAC address of target interface
        mac_file = f"/sys/class/net/{target_iface}/address"
        if os.path.isfile(mac_file):
            try:
                with open(mac_file, "r") as f:
                    telemetry["mac_address"] = f.read().strip()
            except Exception:
                pass

        # 2. Query `iw dev <iface> link`
        if os.path.exists(self.iw_bin):
            code, out, _ = self._run_cmd([self.iw_bin, "dev", target_iface, "link"])
            if code == 0 and out:
                telemetry["raw_details"]["iw_link"] = out
                if "Not connected" in out or "none" in out:
                    telemetry["status"] = "disconnected"
                else:
                    telemetry["status"] = "connected"

                    # BSSID: Connected to 02:00:00:00:00:01 (on wlp0s20f3)
                    bssid_match = re.search(r"Connected to ([0-9a-fA-F:]{17})", out)
                    if bssid_match:
                        telemetry["bssid"] = bssid_match.group(1).upper()

                    # SSID: SSID: FIXTURE-NETWORK
                    ssid_match = re.search(r"SSID:\s*(.+)", out)
                    if ssid_match:
                        telemetry["ssid"] = ssid_match.group(1).strip()

                    # Frequency: freq: 5200.0 or freq: 5200
                    freq_match = re.search(r"freq:\s*([0-9.]+)", out)
                    if freq_match:
                        try:
                            telemetry["frequency_mhz"] = int(float(freq_match.group(1)))
                        except ValueError:
                            pass

                    # Signal: signal: -62 dBm
                    sig_match = re.search(r"signal:\s*(-?[0-9.]+)\s*dBm", out)
                    if sig_match:
                        try:
                            telemetry["rssi_dbm"] = float(sig_match.group(1))
                        except ValueError:
                            pass

                    # RX Bitrate: rx bitrate: 960.7 MBit/s 160MHz
                    rx_match = re.search(r"rx bitrate:\s*([0-9.]+)\s*MBit/s", out)
                    if rx_match:
                        try:
                            telemetry["rx_bitrate_mbps"] = float(rx_match.group(1))
                        except ValueError:
                            pass

                    # TX Bitrate: tx bitrate: 648.5 MBit/s
                    tx_match = re.search(r"tx bitrate:\s*([0-9.]+)\s*MBit/s", out)
                    if tx_match:
                        try:
                            telemetry["tx_bitrate_mbps"] = float(tx_match.group(1))
                        except ValueError:
                            pass

                    # Width: e.g. 160MHz or 80MHz or 40MHz or 20MHz
                    width_match = re.search(r"([0-9]+)MHz", out)
                    if width_match:
                        try:
                            telemetry["channel_width_mhz"] = int(width_match.group(1))
                        except ValueError:
                            pass

        # 3. Query `nmcli` for active connection parameters & security
        if os.path.exists(self.nmcli_bin):
            code, out, _ = self._run_cmd([
                self.nmcli_bin,
                "-t",
                "-f",
                "active,bssid,ssid,mode,chan,freq,rate,signal,security",
                "device",
                "wifi", "list", "ifname", target_iface, "--rescan", "no",
            ])
            if code == 0 and out:
                telemetry["raw_details"]["nmcli_wifi"] = []
                for line in out.splitlines():
                    # Escaped colons in BSSID: yes:02\:00\:00\:00\:00\:01:FIXTURE-NETWORK:Infra:40:5200 MHz:270 Mbit/s:58:WPA2
                    if line.startswith("yes:"):
                        telemetry["raw_details"]["nmcli_active_line"] = line
                        parts = line.split(":")
                        # reconstruct unescaped BSSID
                        cleaned = line.replace(r"\:", "__COLON__")
                        clean_parts = cleaned.split(":")
                        if len(clean_parts) >= 9:
                            bssid = clean_parts[1].replace("__COLON__", ":")
                            ssid = clean_parts[2].replace("__COLON__", ":")
                            chan = clean_parts[4]
                            freq_str = clean_parts[5]
                            sig_pct = clean_parts[7]
                            security = clean_parts[8]

                            if not telemetry["bssid"]:
                                telemetry["bssid"] = bssid
                            if not telemetry["ssid"]:
                                telemetry["ssid"] = ssid
                            if not telemetry["security_protocol"]:
                                telemetry["security_protocol"] = security

                            try:
                                telemetry["channel"] = int(chan)
                            except ValueError:
                                pass

                            try:
                                telemetry["signal_quality_pct"] = int(sig_pct)
                            except ValueError:
                                pass

                            if not telemetry["frequency_mhz"]:
                                f_match = re.search(r"(\d+)", freq_str)
                                if f_match:
                                    telemetry["frequency_mhz"] = int(f_match.group(1))

        # 4. Infer band and channel if missing from frequency
        if telemetry["frequency_mhz"]:
            f = telemetry["frequency_mhz"]
            if 2400 <= f <= 2495:
                telemetry["band"] = "2.4 GHz"
                if not telemetry["channel"]:
                    telemetry["channel"] = int((f - 2407) / 5) if f != 2484 else 14
            elif 5150 <= f <= 5895:
                telemetry["band"] = "5 GHz"
                if not telemetry["channel"]:
                    telemetry["channel"] = int((f - 5000) / 5)
            elif 5925 <= f <= 7125:
                telemetry["band"] = "6 GHz"
                if not telemetry["channel"]:
                    telemetry["channel"] = int((f - 5950) / 5)

        return telemetry

    def get_live_connection_status(self) -> Dict[str, Any]:
        """
        Reads genuine live connection status for the active wireless interface on the host.
        Never fabricates values; strictly distinguishes connected vs disconnected state.
        Identifies measuring device and computes freshness metrics.
        """
        interfaces_res = self.list_interfaces()
        wifi_iface = interfaces_res.discovered_wireless_interface

        now = datetime.now(timezone.utc)
        if not wifi_iface:
            return {
                "is_connected": False,
                "connection_state": "no_wireless_hardware",
                "interface_name": None,
                "ssid": None,
                "bssid": None,
                "frequency_mhz": None,
                "channel": None,
                "channel_width_mhz": None,
                "band": None,
                "rssi_dbm": None,
                "signal_quality_pct": None,
                "rx_bitrate_mbps": None,
                "tx_bitrate_mbps": None,
                "security_protocol": None,
                "measuring_device": f"Backend host ({interfaces_res.hostname})",
                "hostname": interfaces_res.hostname,
                "ip_address": None,
                "default_gateway": interfaces_res.default_gateway,
                "data_provenance": "live_system_probe",
                "checked_at": now.isoformat(),
                "age_seconds": 0,
                "freshness": "fresh",
                "freshness_label": "Fresh (<2m)",
            }

        wifi_info = next((i for i in interfaces_res.interfaces if i.name == wifi_iface), None)
        raw_telemetry = self.collect_wireless_telemetry(wifi_iface)
        is_connected = bool(raw_telemetry.get("status") == "connected" and raw_telemetry.get("ssid"))

        return {
            "is_connected": is_connected,
            "connection_state": "connected" if is_connected else "disconnected",
            "interface_name": wifi_iface,
            "ssid": raw_telemetry.get("ssid") if is_connected else None,
            "bssid": raw_telemetry.get("bssid") if is_connected else None,
            "frequency_mhz": raw_telemetry.get("frequency_mhz") if is_connected else None,
            "channel": raw_telemetry.get("channel") if is_connected else None,
            "channel_width_mhz": raw_telemetry.get("channel_width_mhz") if is_connected else None,
            "band": raw_telemetry.get("band") if is_connected else None,
            "rssi_dbm": raw_telemetry.get("rssi_dbm") if is_connected else None,
            "signal_quality_pct": raw_telemetry.get("signal_quality_pct") if is_connected else None,
            "rx_bitrate_mbps": raw_telemetry.get("rx_bitrate_mbps") if is_connected else None,
            "tx_bitrate_mbps": raw_telemetry.get("tx_bitrate_mbps") if is_connected else None,
            "security_protocol": raw_telemetry.get("security_protocol") if is_connected else None,
            "measuring_device": f"Backend host ({interfaces_res.hostname})",
            "hostname": interfaces_res.hostname,
            "ip_address": wifi_info.ip_address if wifi_info else None,
            "default_gateway": interfaces_res.default_gateway,
            "data_provenance": "live_system_probe",
            "checked_at": now.isoformat(),
            "age_seconds": 0,
            "freshness": "fresh",
            "freshness_label": "Fresh (<2m)",
        }

    def ping_gateway(self, gateway_ip: Optional[str] = None, count: int = 3) -> GatewayPingResult:
        """
        Executes bounded, read-only ICMP echo request to default gateway.
        Guarantees bounded packet count (max 5) and 2-second timeout per probe.
        """
        count = max(1, min(5, count))

        if not gateway_ip:
            discovered_gw, _ = self.discover_default_route()
            gateway_ip = discovered_gw

        if not gateway_ip:
            return GatewayPingResult(
                target_ip="unknown",
                transmitted=0,
                received=0,
                loss_pct=None,
                status="no_gateway_found",
            )

        # Basic security check: ensure IP is a valid IPv4 or IPv6 address (no shell injection possibility)
        try:
            ipaddress.ip_address(gateway_ip)
        except ValueError:
            # check ipv6
            try:
                socket.inet_pton(socket.AF_INET6, gateway_ip)
            except socket.error:
                return GatewayPingResult(
                    target_ip=gateway_ip,
                    transmitted=0,
                    received=0,
                    loss_pct=None,
                    status="invalid_ip_format",
                )

        discovered_gw, _ = self.discover_default_route()
        if gateway_ip != discovered_gw:
            return GatewayPingResult(target_ip=gateway_ip, transmitted=0, received=0,
                                     loss_pct=None, status="target_not_gateway")
        args = [self.ping_bin, "-n", "-c", str(count), "-W", "2", gateway_ip]
        code, out, err = self._run_cmd(args, timeout=float(count * 2 + 1))

        if not out:
            return GatewayPingResult(
                target_ip=gateway_ip,
                transmitted=0,
                received=0,
                loss_pct=None,
                status="probe_unavailable",
            )

        # Parse packets transmitted, received, packet loss
        # "3 packets transmitted, 3 received, 0% packet loss"
        transmitted = count
        received = 0
        loss_pct = 100.0
        rtt_min = None
        rtt_avg = None
        rtt_max = None
        rtt_mdev = None

        tx_match = re.search(r"(\d+)\s+(?:packets\s+)?transmitted,\s+(\d+)\s+(?:packets\s+)?received", out)
        if tx_match:
            transmitted = int(tx_match.group(1))
            received = int(tx_match.group(2))
            loss_pct = float((transmitted - received) / transmitted * 100.0) if transmitted > 0 else 100.0

        if not tx_match or transmitted == 0:
            return GatewayPingResult(target_ip=gateway_ip, transmitted=0, received=0,
                                     loss_pct=None, status="probe_unavailable")

        loss_match = re.search(r"([0-9.]+)%\s+packet loss", out)
        if loss_match:
            try:
                loss_pct = float(loss_match.group(1))
            except ValueError:
                pass

        # Parse rtt min/avg/max/mdev = 1.976/3.499/4.601/1.112 ms
        rtt_match = re.search(r"rtt\s+min/avg/max/(?:mdev|stddev)\s*=\s*([0-9.]+)/([0-9.]+)/([0-9.]+)/([0-9.]+)", out)
        if rtt_match:
            try:
                rtt_min = float(rtt_match.group(1))
                rtt_avg = float(rtt_match.group(2))
                rtt_max = float(rtt_match.group(3))
                rtt_mdev = float(rtt_match.group(4))
            except ValueError:
                pass

        return GatewayPingResult(
            target_ip=gateway_ip,
            transmitted=transmitted,
            received=received,
            loss_pct=loss_pct,
            rtt_min_ms=rtt_min,
            rtt_avg_ms=rtt_avg,
            rtt_max_ms=rtt_max,
            rtt_mdev_ms=rtt_mdev,
            status="completed",
        )

    def test_iperf(
        self,
        target_host: str,
        port: int = 5201,
        duration: int = 5,
        protocol: str = "TCP",
    ) -> IperfResult:
        """
        Executes an optional operator-designated iperf3 test to a target under operator control.
        Enforces maximum 10-second duration and strict target validation.
        """
        try:
            target_host = str(ipaddress.ip_address(target_host))
        except ValueError:
            return IperfResult(target_host=target_host, port=port, status="error", error_message="A literal allowlisted IP is required")
        if target_host not in settings.AIRGRID_AUTHORIZED_IPERF_TARGETS:
            return IperfResult(target_host=target_host, port=port, status="error", error_message="Target is not authorized by host configuration")
        if protocol != "TCP":
            return IperfResult(target_host=target_host, port=port, status="error", error_message="Only bounded TCP tests are supported")
        if not self.iperf_bin:
            return IperfResult(
                target_host=target_host,
                port=port,
                protocol=protocol,
                status="skipped",
                error_message="iperf3 utility is not installed on this host",
            )

        duration = max(1, min(10, duration))
        port = max(1, min(65535, port))

        # Basic hostname / IP regex validation
        if not re.match(r"^[a-zA-Z0-9.-]+$", target_host):
            return IperfResult(
                target_host=target_host,
                port=port,
                protocol=protocol,
                status="error",
                error_message="Invalid target host format",
            )

        args = [
            self.iperf_bin,
            "-c", target_host,
            "-p", str(port),
            "-t", str(duration),
            "-J",  # JSON output
        ]
        if protocol.upper() == "UDP":
            args.append("-u")

        if not self._iperf_lock.acquire(blocking=False):
            return IperfResult(target_host=target_host, port=port, status="error", error_message="A LAN test is already running")
        try:
            code, out, err = self._run_cmd(args, timeout=float(duration + 4))
        finally:
            self._iperf_lock.release()
        if code != 0 or not out:
            return IperfResult(
                target_host=target_host,
                port=port,
                protocol=protocol,
                status="error",
                error_message=err or "iperf3 execution failed to connect",
            )

        try:
            import json
            data = json.loads(out)
            end = data.get("end", {})
            sum_received = end.get("sum_received", {}) or end.get("sum", {})
            bps = sum_received.get("bits_per_second")
            throughput_mbps = round(bps / 1_000_000.0, 2) if bps is not None else None
            jitter_ms = sum_received.get("jitter_ms")
            lost_packets = sum_received.get("lost_packets")

            return IperfResult(
                target_host=target_host,
                port=port,
                protocol=protocol,
                throughput_mbps=throughput_mbps,
                jitter_ms=jitter_ms,
                lost_packets=lost_packets,
                status="completed",
            )
        except Exception as e:
            return IperfResult(
                target_host=target_host,
                port=port,
                protocol=protocol,
                status="error",
                error_message=f"Failed to parse iperf3 JSON: {str(e)}",
            )


telemetry_collector = TelemetryCollector()
