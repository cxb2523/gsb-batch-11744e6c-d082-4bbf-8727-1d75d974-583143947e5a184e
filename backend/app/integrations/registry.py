"""
Provider registry. Providers register themselves at import time (see __init__.py);
everything else looks them up here by key or capability.
"""

from typing import Optional

from .base import Capability, IntegrationProvider


_PROVIDERS: dict[str, IntegrationProvider] = {}


def register(provider: IntegrationProvider) -> None:
    """Register a provider instance. Last registration for a key wins."""
    _PROVIDERS[provider.key] = provider


def get(key: str) -> Optional[IntegrationProvider]:
    return _PROVIDERS.get(key)


def all_providers() -> list[IntegrationProvider]:
    return list(_PROVIDERS.values())


def with_capability(cap: Capability) -> list[IntegrationProvider]:
    return [p for p in _PROVIDERS.values() if p.has(cap)]


def notifying_providers() -> list[IntegrationProvider]:
    """Providers that can deliver a notification in any form."""
    return [
        p for p in _PROVIDERS.values()
        if p.has(Capability.NOTIFY_CHANNEL) or p.has(Capability.NOTIFY_DM)
    ]
