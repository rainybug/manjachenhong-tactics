#!/usr/bin/env python3
"""Download official third-part FE Fortune's Weave portrait thumbnails to local app assets.

Reads portrait-sources.json, downloads images from source websites on the user's
machine once; app always loads *local files*, and never hotlinks external images.
Usage: python download_portraits.py (or py -3 download_portraits.py on Windows).
"""
import argparse
import concurrent.futures
import json
import pathlib
import time
import urllib.error
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent
MANIFEST = ROOT / 'portrait-sources.json'
OUT = ROOT / 'assets' / 'portraits'
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'


def image_bytes_valid(payload):
    return (len(payload) > 2000 and (
        payload.startswith(b'RIFF') and payload[8:12] == b'WEBP'
        or payload.startswith(b'\x89PNG\r\n\x1a\n')
        or payload.startswith(b'\xff\xd8\xff')
    ))


def fetch_one(entry, overwrite=False):
    OUT.mkdir(parents=True, exist_ok=True)
    filename = entry['image_file']
    assert '/' not in filename and '\\' not in filename
    dest = OUT / filename
    if dest.exists() and not overwrite and image_bytes_valid(dest.read_bytes()):
        return entry['name'], 'already saved', ''
    errors=[]
    for attempt in range(3):
        try:
            req=urllib.request.Request(entry['url'],headers={
                'User-Agent': UA,
                'Referer': 'https://game8.jp/',
                'Accept': 'image/webp,image/avif,image/apng,image/png,image/*;q=0.8,*/*;q=0.5',
            })
            with urllib.request.urlopen(req, timeout=20) as resp:
                payload=resp.read(12_000_000)
            if not image_bytes_valid(payload):
                raise RuntimeError('server did not return a supported image')
            temp=dest.with_suffix('.part')
            temp.write_bytes(payload)
            temp.replace(dest)
            return entry['name'],'downloaded',''
        except Exception as exc:
            errors.append(str(exc).splitlines()[0][:120])
            time.sleep(.25*(attempt+1))
    return entry['name'],'FAILED',errors[-1]


def main():
    parser=argparse.ArgumentParser(description='Download 3부/5년 후 얼굴 이미지를 로컬 폴더에 저장')
    parser.add_argument('--overwrite',action='store_true',help='기존 사진도 다시 받기')
    parser.add_argument('--verify',action='store_true',help='설치된 이미지 수 확인만')
    parser.add_argument('--workers',type=int,default=4,help='병렬 다운로드 수 (기본 4)')
    args=parser.parse_args()
    entries=json.loads(MANIFEST.read_text(encoding='utf-8'))['portraits']
    OUT.mkdir(parents=True,exist_ok=True)
    if args.verify:
        ok=[e for e in entries if (OUT/e['image_file']).is_file() and image_bytes_valid((OUT/e['image_file']).read_bytes())]
        print(f'Installed valid images: {len(ok)}/{len(entries)}')
        for e in entries:
            if e not in ok:print(' - missing:',e['name'])
        return
    print(f'Portraits: {len(entries)}; saving to {OUT}')
    failed=[];done=0
    with concurrent.futures.ThreadPoolExecutor(max_workers=max(1,min(args.workers,8))) as pool:
        futures={pool.submit(fetch_one,e,args.overwrite):e for e in entries}
        for f in concurrent.futures.as_completed(futures):
            name,status,error=f.result()
            done+=1
            print(f'[{done:02d}/{len(entries)}] {name}: {status}'+(f' ({error})' if error else ''),flush=True)
            if status=='FAILED':failed.append(name)
    print(f'\nDownloaded/available: {len(entries)-len(failed)}/{len(entries)}')
    if failed:
        print('Failed:',', '.join(failed))
        print('If an image host blocks downloads, manually save its portrait as its id.webp in assets/portraits/.')
    else:print('Done. Open index.html. Portraits now load locally without internet.')


if __name__=='__main__':main()
