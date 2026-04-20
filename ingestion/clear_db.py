"""Delete all rows from the documents table."""

import os
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

url = os.environ["SUPABASE_URL"]
key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

sb = create_client(url, key)
# Delete all rows by matching on a column that is always set
sb.table("documents").delete().neq("chunk_hash", "").execute()
print("All documents deleted.")
