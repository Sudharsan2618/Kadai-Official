#!/usr/bin/env python3
"""Smoke-test Meta WhatsApp Cloud API + Marketing Messages API.

No SDK or third-party dependency is required. The script reads values from
environment variables or securely prompts for missing secrets.

Examples:
  python scripts/test_mm_api.py --waba-id 123 --phone-number-id 456
  python scripts/test_mm_api.py --waba-id 123 --phone-number-id 456 --send

Required:
  META_ACCESS_TOKEN   Customer/system-user token with WhatsApp permissions
  WABA_ID              WhatsApp Business Account ID
  PHONE_NUMBER_ID      Business phone number ID

For --send:
  RECIPIENT_PHONE      E.164 digits without '+'; sandbox recipient number
  MM_TEMPLATE_NAME     Defaults to mm_lite_sandbox
"""
from __future__ import annotations

import argparse
import getpass
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request


API_VERSION = os.getenv("WA_API_VERSION", "v25.0")
GRAPH_BASE = f"https://graph.facebook.com/{API_VERSION}"


def secret(name: str, prompt: str) -> str:
    value = os.getenv(name, "").strip()
    return value or getpass.getpass(f"{prompt}: ").strip()


def value(name: str, prompt: str, supplied: str = "") -> str:
    return (supplied or os.getenv(name, "")).strip() or input(f"{prompt}: ").strip()


def graph(method: str, path: str, token: str, payload: dict | None = None,
          query: dict | None = None) -> dict:
    url = f"{GRAPH_BASE}{path}"
    if query:
        url += "?" + urllib.parse.urlencode(query)
    body = json.dumps(payload).encode() if payload is not None else None
    request = urllib.request.Request(
        url,
        data=body,
        method=method,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.loads(response.read() or b"{}")
    except urllib.error.HTTPError as error:
        raw = error.read().decode(errors="replace")
        try:
            detail = json.loads(raw)
        except json.JSONDecodeError:
            detail = {"error": raw}
        raise RuntimeError(f"Graph API HTTP {error.code}: {json.dumps(detail)}") from error
    except urllib.error.URLError as error:
        raise RuntimeError(f"Could not reach Graph API: {error.reason}") from error


def print_json(title: str, data: dict) -> None:
    print(f"\n{title}")
    print(json.dumps(data, indent=2))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--waba-id", default="", help="WhatsApp Business Account ID")
    parser.add_argument("--phone-number-id", default="", help="Business phone number ID")
    parser.add_argument("--send", action="store_true", help="Send one MM API test message")
    parser.add_argument("--recipient", default="", help="Recipient phone, E.164 digits without +")
    parser.add_argument("--template", default="", help="Template name; default mm_lite_sandbox")
    args = parser.parse_args()

    print(f"Using Graph API {API_VERSION}")
    token = secret("META_ACCESS_TOKEN", "Meta access token")
    if not token:
        print("Missing access token", file=sys.stderr)
        return 2

    waba_id = value("WABA_ID", "WABA ID", args.waba_id)
    phone_number_id = value("PHONE_NUMBER_ID", "Phone number ID", args.phone_number_id)
    if not waba_id or not phone_number_id:
        print("WABA_ID and PHONE_NUMBER_ID are required", file=sys.stderr)
        return 2

    try:
        # Token sanity check. The token is never printed.
        me = graph("GET", "/me", token, query={"fields": "id,name"})
        print_json("Token accepted", me)

        status = graph(
            "GET", f"/{waba_id}", token,
            query={"fields": "id,name,marketing_messages_onboarding_status"},
        )
        print_json("WABA status", status)

        numbers = graph(
            "GET", f"/{waba_id}/phone_numbers", token,
            query={"fields": "id,display_phone_number,verified_name,quality_rating", "limit": "100"},
        )
        print_json("WABA phone numbers", numbers)
        known_ids = {str(item.get("id")) for item in numbers.get("data", [])}
        if phone_number_id not in known_ids:
            raise RuntimeError("PHONE_NUMBER_ID is not listed under WABA_ID")

        if not args.send:
            print("\nRead-only checks passed. Re-run with --send to send one test message.")
            return 0

        recipient = value("RECIPIENT_PHONE", "Recipient phone (E.164 digits without +)", args.recipient)
        template = value("MM_TEMPLATE_NAME", "MM template name", args.template or "mm_lite_sandbox")
        if not recipient:
            print("RECIPIENT_PHONE is required for --send", file=sys.stderr)
            return 2

        result = graph(
            "POST", f"/{phone_number_id}/marketing_messages", token,
            payload={
                "messaging_product": "whatsapp",
                "recipient_type": "individual",
                "to": recipient,
                "type": "template",
                "template": {
                    "name": template,
                    "language": {"code": "en"},
                },
            },
        )
        print_json("MM API send response", result)
        print("\nSend request accepted by Meta. Check the recipient and webhook logs.")
        return 0
    except RuntimeError as error:
        print(f"\nFAILED: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
