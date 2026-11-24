#!/usr/bin/env python3
"""Parse an X archive export into clean post data for the LiveAvatar KB.

Usage:
    python3 parse-x-archive.py <archive-dir> [--out <out-dir>]

Reads data/tweets.js (and tweets-partN.js) plus data/note-tweet.js, strips the
`window.YTD.<name>.part0 = [...]` wrapper, joins long-post full text, and
writes:
    posts.json        - all own posts, chronological, with text/flags/counts
    posts.txt         - plain chronological dump (date + text) for review
    stats.json        - counts by kind, date range, top hashtags, top liked

Kinds: original | reply | retweet (bare retweets, "RT @...").
Long posts (>280 chars) are truncated in tweets.js; full text comes from
note-tweet.js keyed by tweet id.
"""
import argparse
import glob
import json
import os
import re
import sys
from collections import Counter
from datetime import datetime


def load_ytd(path):
    """Load a window.YTD.*.partN = [...] file as JSON."""
    with open(path, encoding="utf-8") as f:
        text = f.read()
    start = text.index("[")
    return json.loads(text[start:])


def parse_args():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("archive_dir", help="unzipped archive dir (contains data/)")
    ap.add_argument("--out", default="x-posts-out",
                    help="output directory (default: x-posts-out)")
    return ap.parse_args()


def main():
    args = parse_args()
    data_dir = os.path.join(args.archive_dir, "data")
    if not os.path.isdir(data_dir):
        data_dir = args.archive_dir  # allow passing data/ directly
    tweet_files = sorted(glob.glob(os.path.join(data_dir, "tweets*.js")))
    if not tweet_files:
        sys.exit(f"no tweets*.js found in {data_dir}")

    # Full text for long posts: note-tweet.js -> {id: text}
    note_text = {}
    note_path = os.path.join(data_dir, "note-tweet.js")
    if os.path.exists(note_path):
        for entry in load_ytd(note_path):
            nt = entry.get("note_tweet", {})
            if nt.get("id") and nt.get("text"):
                note_text[nt["id"]] = nt["text"]

    posts = []
    seen = set()
    for path in tweet_files:
        for entry in load_ytd(path):
            t = entry.get("tweet", entry)
            tid = t.get("id_str") or str(t.get("id", ""))
            if not tid or tid in seen:
                continue
            seen.add(tid)
            text = note_text.get(tid) or t.get("full_text") or t.get("text", "")
            is_rt = text.startswith("RT @")
            kind = ("retweet" if is_rt else
                    "reply" if t.get("in_reply_to_status_id_str") else "original")
            entities = t.get("entities", {}) or {}
            posts.append({
                "id": tid,
                "created_at": t.get("created_at", ""),
                "kind": kind,
                "text": text,
                "in_reply_to": t.get("in_reply_to_screen_name", ""),
                "favorite_count": t.get("favorite_count", 0),
                "retweet_count": t.get("retweet_count", 0),
                "hashtags": [h.get("text", "") for h in entities.get("hashtags", [])],
                "urls": [u.get("expanded_url", "") for u in entities.get("urls", [])],
            })

    posts.sort(key=lambda p: p["created_at"])

    os.makedirs(args.out, exist_ok=True)
    with open(os.path.join(args.out, "posts.json"), "w", encoding="utf-8") as f:
        json.dump(posts, f, ensure_ascii=False, indent=1)
    with open(os.path.join(args.out, "posts.txt"), "w", encoding="utf-8") as f:
        for p in posts:
            f.write(f"[{p['created_at']}] ({p['kind']}) {p['text']}\n\n")

    kinds = Counter(p["kind"] for p in posts)
    tags = Counter(t for p in posts for t in p["hashtags"])
    stats = {
        "total": len(posts),
        "by_kind": dict(kinds),
        "date_range": [posts[0]["created_at"], posts[-1]["created_at"]] if posts else [],
        "top_hashtags": tags.most_common(20),
        "most_liked": sorted(posts, key=lambda p: -p["favorite_count"])[:10],
        "most_retweeted": sorted(posts, key=lambda p: -p["retweet_count"])[:10],
    }
    with open(os.path.join(args.out, "stats.json"), "w", encoding="utf-8") as f:
        json.dump(stats, f, ensure_ascii=False, indent=1)

    print(f"{len(posts)} posts: " +
          ", ".join(f"{k}={v}" for k, v in sorted(kinds.items())))
    if posts:
        print(f"range: {posts[0]['created_at']} .. {posts[-1]['created_at']}")
    print(f"wrote {args.out}/posts.json, posts.txt, stats.json")


if __name__ == "__main__":
    main()
