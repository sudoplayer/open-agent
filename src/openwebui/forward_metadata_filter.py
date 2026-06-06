"""
title: Forward Metadata
description: Injects user_id and chat_id into request body for backend session management
"""

from typing import Optional


class Filter:
    def __init__(self):
        pass

    async def inlet(self, body: dict, __user__: Optional[dict] = None) -> dict:
        metadata = body.get("metadata", {})

        if metadata:
            body["user_id"] = metadata.get("user_id")
            body["chat_id"] = metadata.get("chat_id")

        return body

    async def outlet(self, body: dict, __user__: Optional[dict] = None) -> dict:
        return body
