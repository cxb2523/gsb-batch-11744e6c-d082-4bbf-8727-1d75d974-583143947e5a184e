from typing import AsyncGenerator, Optional

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

from ..core.settings import get_settings


_client: Optional[AsyncIOMotorClient] = None


def get_mongo_client() -> AsyncIOMotorClient:
  global _client
  if _client is None:
    settings = get_settings()
    # tz_aware=True so datetimes read back from Mongo carry UTC tzinfo. Without it the
    # driver returns naive datetimes, which serialize without an offset and get parsed as
    # LOCAL time by the frontend (new Date(...)), skewing every timestamp by the client's
    # UTC offset (e.g. +5:30 for IST). Writes already use datetime.now(timezone.utc).
    _client = AsyncIOMotorClient(settings.mongodb_uri, tz_aware=True)
  return _client


async def get_mongo_db() -> AsyncGenerator[AsyncIOMotorDatabase, None]:
  settings = get_settings()
  client = get_mongo_client()
  db = client[settings.mongodb_db_name]
  yield db


