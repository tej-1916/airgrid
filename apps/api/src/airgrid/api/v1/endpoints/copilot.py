import json
import logging
import time
from contextlib import aclosing
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy import and_, desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from airgrid.api.deps import get_current_user, require_authenticated, verify_csrf
from airgrid.core.database import get_db
from airgrid.models.all_models import AIChatConversation, AIChatMessage, Campus, User
from airgrid.schemas.copilot import (
    ChatMessageCreate,
    ChatMessageResponse,
    ConversationCreate,
    ConversationListResponse,
    ConversationResponse,
    ConversationSummary,
    ConversationUpdate,
)
from airgrid.services.ai_gateway import ai_gateway
from airgrid.services.campus_service import require_campus_access
from airgrid.services.copilot_service import (
    build_copilot_system_prompt,
    build_messages_history,
    gather_floor_authorize,
    gather_scoped_context,
    sanitize_text,
)

logger = logging.getLogger("airgrid")
router = APIRouter(prefix="/copilot", tags=["AirGrid AI Copilot"])


@router.get("/conversations", response_model=ConversationListResponse, dependencies=[Depends(require_authenticated)])
async def list_conversations(
    limit: int = Query(50, ge=1, le=100),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all AI Copilot chat conversations for the authenticated user."""
    stmt = (
        select(AIChatConversation)
        .options(selectinload(AIChatConversation.messages))
        .where(AIChatConversation.user_id == user.id)
        .order_by(desc(AIChatConversation.updated_at))
        .limit(limit)
    )
    res = await db.execute(stmt)
    conversations = res.scalars().all()

    summaries = []
    for c in conversations:
        msgs = c.messages or []
        last_msg = msgs[-1].content[:80] + "..." if msgs else None
        summaries.append(
            ConversationSummary(
                id=c.id,
                title=c.title,
                model=c.model,
                campus_id=c.campus_id,
                created_at=c.created_at,
                updated_at=c.updated_at,
                message_count=len(msgs),
                last_message_preview=last_msg,
            )
        )

    count_stmt = select(func.count(AIChatConversation.id)).where(AIChatConversation.user_id == user.id)
    total_res = await db.execute(count_stmt)
    total = total_res.scalar() or 0

    return ConversationListResponse(conversations=summaries, total=total)


@router.post("/conversations", response_model=ConversationResponse, dependencies=[Depends(verify_csrf)])
async def create_conversation(
    req: ConversationCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new AI Copilot conversation with campus authorization enforcement."""
    if req.campus_id:
        campus = await db.get(Campus, req.campus_id)
        if not campus:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Campus not found.")
        if user.role != "administrator":
            await require_campus_access(db, user, req.campus_id)

    conversation = AIChatConversation(
        user_id=user.id,
        title=req.title.strip() if req.title and req.title.strip() else "New Conversation",
        model=req.model.strip() if req.model and req.model.strip() else (ai_gateway.active_model or "auto"),
        campus_id=req.campus_id,
    )
    db.add(conversation)
    await db.commit()
    await db.refresh(conversation)

    return ConversationResponse(
        id=conversation.id,
        user_id=conversation.user_id,
        title=conversation.title,
        model=conversation.model,
        campus_id=conversation.campus_id,
        created_at=conversation.created_at,
        updated_at=conversation.updated_at,
        messages=[],
    )


@router.get("/conversations/{conversation_id}", response_model=ConversationResponse, dependencies=[Depends(require_authenticated)])
async def get_conversation(
    conversation_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Retrieve an existing conversation and its full message history."""
    stmt = (
        select(AIChatConversation)
        .options(selectinload(AIChatConversation.messages))
        .where(and_(AIChatConversation.id == conversation_id, AIChatConversation.user_id == user.id))
    )
    res = await db.execute(stmt)
    conv = res.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found.")

    return ConversationResponse.model_validate(conv)


@router.patch("/conversations/{conversation_id}", response_model=ConversationResponse, dependencies=[Depends(verify_csrf)])
async def update_conversation(
    conversation_id: uuid.UUID,
    req: ConversationUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Rename a conversation or change its default model/campus with authorization checks."""
    stmt = (
        select(AIChatConversation)
        .options(selectinload(AIChatConversation.messages))
        .where(and_(AIChatConversation.id == conversation_id, AIChatConversation.user_id == user.id))
    )
    res = await db.execute(stmt)
    conv = res.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found.")

    if req.title is not None and req.title.strip():
        conv.title = req.title.strip()
    if req.model is not None and req.model.strip():
        conv.model = req.model.strip()
    if req.campus_id is not None:
        campus = await db.get(Campus, req.campus_id)
        if not campus:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Campus not found.")
        if user.role != "administrator":
            await require_campus_access(db, user, req.campus_id)
        conv.campus_id = req.campus_id

    conv.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(conv)

    return ConversationResponse.model_validate(conv)


@router.delete("/conversations/{conversation_id}", dependencies=[Depends(verify_csrf)])
async def delete_conversation(
    conversation_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a conversation and all its messages."""
    stmt = select(AIChatConversation).where(
        and_(AIChatConversation.id == conversation_id, AIChatConversation.user_id == user.id)
    )
    res = await db.execute(stmt)
    conv = res.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found.")

    await db.delete(conv)
    await db.commit()
    return {"ok": True, "deleted_id": str(conversation_id)}


@router.post("/conversations/{conversation_id}/messages", response_model=ChatMessageResponse, dependencies=[Depends(verify_csrf)])
async def send_message(
    conversation_id: uuid.UUID,
    req: ChatMessageCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Send a user message to the AI Copilot and get the full completed response."""
    stmt = select(AIChatConversation).where(
        and_(AIChatConversation.id == conversation_id, AIChatConversation.user_id == user.id)
    )
    res = await db.execute(stmt)
    conv = res.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found.")

    # Campus authorization check before message intake or AI processing
    if conv.campus_id and user.role != "administrator":
        await require_campus_access(db, user, conv.campus_id)
    if req.floor_id is not None:
        await gather_floor_authorize(db, user, req.floor_id, conv.campus_id)  # 403/404 before intake and before any provider call

    # 1. Save user message
    user_content_clean = sanitize_text(req.content.strip())
    user_msg = AIChatMessage(
        conversation_id=conv.id,
        role="user",
        content=user_content_clean,
        status="completed",
    )
    db.add(user_msg)
    conv.updated_at = datetime.now(timezone.utc)

    # Auto-rename if first message and still has default title
    if conv.title in ("New Conversation", "AirGrid Copilot Chat"):
        conv.title = user_content_clean[:45] + ("..." if len(user_content_clean) > 45 else "")

    await db.commit()

    # 2. Gather network context
    context_text = ""
    citations = []
    if req.include_network_context:
        context_text, citations = await gather_scoped_context(db, user, conv.campus_id, req.floor_id)

    # 3. Build system prompt and message history
    system_prompt = build_copilot_system_prompt(context_text)
    chat_messages = await build_messages_history(db, conv, system_prompt)

    # 4. Generate response
    chosen_model = req.model or conv.model or ai_gateway.active_model
    started = time.perf_counter()
    ai_res = await ai_gateway.generate_chat(messages=chat_messages, model=chosen_model)
    duration_ms = int((time.perf_counter() - started) * 1000)

    if ai_res.get("ok"):
        assistant_msg = AIChatMessage(
            conversation_id=conv.id,
            role="assistant",
            content=ai_res.get("content", ""),
            model_used=ai_res.get("model", chosen_model),
            tokens_prompt=ai_res.get("tokens_prompt"),
            tokens_completion=ai_res.get("tokens_completion"),
            duration_ms=duration_ms,
            citations=citations,
            status="completed",
        )
    else:
        assistant_msg = AIChatMessage(
            conversation_id=conv.id,
            role="assistant",
            content="I encountered an issue connecting to the AI provider. " + ai_res.get("error", ""),
            model_used=ai_res.get("model", chosen_model),
            duration_ms=duration_ms,
            citations=citations,
            status="error",
            error_message=ai_res.get("error"),
        )

    db.add(assistant_msg)
    conv.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(assistant_msg)

    return ChatMessageResponse.model_validate(assistant_msg)


@router.post("/conversations/{conversation_id}/messages/stream", dependencies=[Depends(verify_csrf)])
async def stream_message(
    conversation_id: uuid.UUID,
    req: ChatMessageCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Send a user message and stream the response via Server-Sent Events (SSE)."""
    stmt = select(AIChatConversation).where(
        and_(AIChatConversation.id == conversation_id, AIChatConversation.user_id == user.id)
    )
    res = await db.execute(stmt)
    conv = res.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found.")

    # Campus authorization check before message intake or AI processing
    if conv.campus_id and user.role != "administrator":
        await require_campus_access(db, user, conv.campus_id)
    if req.floor_id is not None:
        await gather_floor_authorize(db, user, req.floor_id, conv.campus_id)  # 403/404 before intake and before any provider call

    # 1. Save user message (or, on retry, re-run the stored one and drop the failed reply: no duplicates)
    if req.retry:
        tail_res = await db.execute(
            select(AIChatMessage)
            .where(AIChatMessage.conversation_id == conv.id)
            .order_by(desc(AIChatMessage.created_at))
            .limit(3)
        )
        tail = list(tail_res.scalars().all())  # newest first
        failed = []
        while tail and tail[0].role == "assistant" and tail[0].status == "error":
            failed.append(tail.pop(0))
        if not tail or tail[0].role != "user":
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Nothing to retry in this conversation.")
        for m in failed:
            await db.delete(m)
        conv.updated_at = datetime.now(timezone.utc)
        await db.commit()
    else:
        user_content_clean = sanitize_text(req.content.strip())
        db.add(AIChatMessage(conversation_id=conv.id, role="user", content=user_content_clean, status="completed"))
        if conv.title in ("New Conversation", "AirGrid Copilot Chat"):
            conv.title = user_content_clean[:45] + ("..." if len(user_content_clean) > 45 else "")
        conv.updated_at = datetime.now(timezone.utc)
        await db.commit()

    # 2. Gather network context
    context_text = ""
    citations = []
    if req.include_network_context:
        context_text, citations = await gather_scoped_context(db, user, conv.campus_id, req.floor_id)

    system_prompt = build_copilot_system_prompt(context_text)
    chat_messages = await build_messages_history(db, conv, system_prompt)
    chosen_model = req.model or conv.model or ai_gateway.active_model

    async def event_generator():
        accumulated_text = []
        actual_model = chosen_model
        started = time.perf_counter()
        terminal = {"type": "error", "error": "No response was produced.", "code": "no_response", "recoverable": True}

        # aclosing: if the client disconnects/cancels, the upstream provider request is closed immediately
        try:
            async with aclosing(ai_gateway.generate_chat_stream(messages=chat_messages, model=chosen_model)) as stream:
                async for chunk in stream:
                    chunk_type = chunk.get("type")
                    if chunk_type == "chunk":
                        piece = chunk.get("content", "")
                        if piece:
                            accumulated_text.append(piece)
                            actual_model = chunk.get("model") or actual_model
                            yield f"data: {json.dumps({'type': 'chunk', 'content': piece, 'model': actual_model})}\n\n"
                    elif chunk_type in ("done", "error"):
                        terminal = chunk
                        actual_model = chunk.get("model") or actual_model
                        break
        except Exception:
            logger.exception("Copilot stream failed unexpectedly")
            terminal = {"type": "error", "error": "Unexpected error while generating the response.", "code": "internal", "recoverable": True}

        duration_ms = int((time.perf_counter() - started) * 1000)
        final_content = "".join(accumulated_text)
        ok = terminal.get("type") == "done"
        code = terminal.get("code")
        # Never invent output: a failed turn is stored as an error row with the real reason.
        saved_content = final_content if (ok or final_content) else "The AI provider did not return a response. You can retry."

        from airgrid.core.database import AsyncSessionLocal
        saved_msg_id = None
        if AsyncSessionLocal:
            async with AsyncSessionLocal() as session:
                assistant_msg = AIChatMessage(
                    conversation_id=conv.id,
                    role="assistant",
                    content=saved_content,
                    model_used=actual_model,
                    duration_ms=duration_ms,
                    citations=citations,
                    status="completed" if ok else "error",
                    error_message=None if ok else code,
                )
                session.add(assistant_msg)
                await session.commit()
                await session.refresh(assistant_msg)
                saved_msg_id = str(assistant_msg.id)

        if ok:
            payload = {
                "type": "done",
                "message_id": saved_msg_id,
                "content": final_content,
                "model": actual_model,
                "requested_model": chosen_model,
                "fallback_used": terminal.get("fallback_used", False),
                "duration_ms": duration_ms,
                "citations": citations,
            }
        else:
            payload = {
                "type": "error",
                "message_id": saved_msg_id,
                "error": terminal.get("error", "Error generating response."),
                "code": code,
                "recoverable": bool(terminal.get("recoverable")),
                "partial": bool(terminal.get("partial")),
                "content": final_content,
                "model": actual_model,
                "requested_model": chosen_model,
                "duration_ms": duration_ms,
            }
        yield f"data: {json.dumps(payload)}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/conversations/{conversation_id}/messages/{message_id}/regenerate", response_model=ChatMessageResponse, dependencies=[Depends(verify_csrf)])
async def regenerate_message(
    conversation_id: uuid.UUID,
    message_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Regenerate an assistant message in the conversation."""
    stmt = select(AIChatConversation).where(
        and_(AIChatConversation.id == conversation_id, AIChatConversation.user_id == user.id)
    )
    res = await db.execute(stmt)
    conv = res.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found.")
    if conv.campus_id and user.role != "administrator":
        await require_campus_access(db, user, conv.campus_id)  # revoked membership must not reach the provider

    target_stmt = select(AIChatMessage).where(
        and_(AIChatMessage.id == message_id, AIChatMessage.conversation_id == conv.id, AIChatMessage.role == "assistant")
    )
    target_res = await db.execute(target_stmt)
    existing_msg = target_res.scalar_one_or_none()
    if not existing_msg:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assistant message not found to regenerate.")

    context_text, citations = await gather_scoped_context(db, user, conv.campus_id)
    system_prompt = build_copilot_system_prompt(context_text)
    chat_messages = await build_messages_history(db, conv, system_prompt)

    started = time.perf_counter()
    ai_res = await ai_gateway.generate_chat(messages=chat_messages, model=conv.model)
    duration_ms = int((time.perf_counter() - started) * 1000)

    if ai_res.get("ok"):
        existing_msg.content = ai_res.get("content", "")
        existing_msg.model_used = ai_res.get("model", conv.model)
        existing_msg.duration_ms = duration_ms
        existing_msg.citations = citations
        existing_msg.status = "completed"
        existing_msg.error_message = None
    else:
        existing_msg.status = "error"
        existing_msg.error_message = ai_res.get("error")

    conv.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(existing_msg)

    return ChatMessageResponse.model_validate(existing_msg)
