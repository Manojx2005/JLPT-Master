import json
import re
import urllib.request
import urllib.parse
import ssl
import time

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

def translate_batch(texts, target_lang):
    if not texts: return []
    query = '\n'.join(texts)
    url = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=' + target_lang + '&dt=t&q=' + urllib.parse.quote(query)
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    max_retries = 3
    for attempt in range(max_retries):
        try:
            res = urllib.request.urlopen(req, context=ctx)
            data = json.loads(res.read().decode('utf-8'))
            if not data or not data[0]: return [""] * len(texts)
            translated = "".join([part[0] for part in data[0] if part[0]])
            results = [line.strip() for line in translated.split('\n')]
            while len(results) < len(texts): results.append("")
            return results[:len(texts)]
        except Exception as e:
            print(f"Error on attempt {attempt+1}: {e}")
            time.sleep(1)
    return [""] * len(texts)

with open('data.js', 'r', encoding='utf-8') as f:
    content = f.read()

lines = content.split('\n')
english_meanings = []
line_indices = []

for i, line in enumerate(lines):
    if 'correct: "' in line and 'meaning_vn' not in line:
        m = re.search(r'correct: "(.*?)"', line)
        if m:
            english_meanings.append(m.group(1))
            line_indices.append(i)

print(f"Found {len(english_meanings)} items to translate.")

if len(english_meanings) > 0:
    batch_size = 50
    vn_translations = []
    my_translations = []

    for i in range(0, len(english_meanings), batch_size):
        batch = english_meanings[i:i+batch_size]
        print(f"Translating batch {i//batch_size + 1}/{(len(english_meanings)+batch_size-1)//batch_size}...")
        vn_trans = translate_batch(batch, 'vi')
        my_trans = translate_batch(batch, 'my')
        vn_translations.extend(vn_trans)
        my_translations.extend(my_trans)
        time.sleep(0.5)

    # Now inject back
    for i, idx in enumerate(line_indices):
        line = lines[idx]
        vn = vn_translations[i].replace('"', '\\"') if i < len(vn_translations) else ""
        my = my_translations[i].replace('"', '\\"') if i < len(my_translations) else ""
        
        if 'level: "' in line:
            new_line = line.replace('level: "', f'meaning_vn: "{vn}", meaning_my: "{my}", level: "')
            lines[idx] = new_line

    with open('data.js', 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines))

print("Translation complete!")
