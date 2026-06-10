import json
import codecs
import re

with codecs.open('c:/Users/Manoj/Desktop/Japanese-Local-Website-main/grammar_parsed.json', 'r', 'utf-8') as f:
    new_data = json.load(f)

js_lines = []
js_lines.append('    // ===== New N1/N2 Grammar (From Excel) =====')
for item in new_data:
    js_line = f"    {{ pattern: {repr(item['pattern'])}, meaning: {repr(item['meaning'])}, level: '{item['level']}', structure: {repr(item['structure'])}, examples: {json.dumps(item['examples'], ensure_ascii=False)}, notes: {repr(item['notes'])} }},"
    js_lines.append(js_line)

with codecs.open('c:/Users/Manoj/Desktop/Japanese-Local-Website-main/features.js', 'r', 'utf-8') as f:
    content = f.read()

match = re.search(r'var GRAMMAR_DATA = \[.*?\];', content, re.DOTALL)
if match:
    block = match.group(0)
    last_idx = block.rfind('];')
    new_block = block[:last_idx] + '\n' + '\n'.join(js_lines) + '\n];'
    
    new_content = content[:match.start()] + new_block + content[match.end():]
    
    with codecs.open('c:/Users/Manoj/Desktop/Japanese-Local-Website-main/features.js', 'w', 'utf-8') as f:
        f.write(new_content)
    print('Successfully appended', len(new_data), 'items to GRAMMAR_DATA in features.js!')
else:
    print('Could not find GRAMMAR_DATA block.')
