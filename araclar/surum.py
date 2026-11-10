#!/usr/bin/env python3
"""Yayından önce çalıştır: index.html'deki dosya sürümlerini ve surum.json'u yeni sürüme günceller.
Böylece telefonlar eski dosyaları önbellekten getirmez."""
import re, json, time, pathlib
kok = pathlib.Path(__file__).resolve().parent.parent
v = time.strftime('%Y%m%d%H%M%S')
idx = kok / 'index.html'
s = idx.read_text(encoding='utf-8')
s = re.sub(r"window\.SURUM = '[^']*'", f"window.SURUM = '{v}'", s)
s = re.sub(r'\?v=[0-9A-Za-z]+"', f'?v={v}"', s)
idx.write_text(s, encoding='utf-8')
(kok / 'surum.json').write_text(json.dumps({'v': v}) + '\n', encoding='utf-8')
print('sürüm', v)
