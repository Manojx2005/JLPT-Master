import zipfile
import xml.etree.ElementTree as ET
import json
import codecs
import re

def read_xlsx_inline(filepath, level):
    results = []
    with zipfile.ZipFile(filepath, 'r') as z:
        with z.open('xl/worksheets/sheet1.xml') as f:
            tree = ET.parse(f)
            root = tree.getroot()
            ns = {'ns': root.tag.split('}')[0].strip('{')}
            
            rows = []
            for row in root.findall('.//ns:row', ns):
                row_data = []
                for c in row.findall('ns:c', ns):
                    val = ''
                    t = c.get('t')
                    if t == 'inlineStr':
                        is_node = c.find('ns:is', ns)
                        if is_node is not None:
                            t_node = is_node.find('ns:t', ns)
                            if t_node is not None:
                                val = t_node.text
                    else:
                        v = c.find('ns:v', ns)
                        if v is not None:
                            val = v.text
                    row_data.append(val or '')
                if any(row_data):
                    rows.append(row_data)
                    
            data_start = 0
            for i, r in enumerate(rows):
                if len(r) >= 5 and 'Ngữ pháp' in r[0]:
                    data_start = i + 1
                    break
            
            for r in rows[data_start:]:
                if len(r) < 5: continue
                pattern = r[0].strip()
                if not pattern: continue
                structure = r[1].strip() if len(r)>1 else ''
                jp_example = r[2].strip() if len(r)>2 else ''
                notes = r[3].strip() if len(r)>3 else ''
                meaning_en = r[4].strip() if len(r)>4 else ''
                meaning_vn = r[5].strip() if len(r)>5 else ''
                meaning_my = r[6].strip() if len(r)>6 else ''
                
                results.append({
                    'pattern': pattern,
                    'meaning': meaning_en,
                    'meaning_vn': meaning_vn,
                    'meaning_my': meaning_my,
                    'level': level,
                    'structure': structure,
                    'examples': [{'jp': jp_example, 'en': meaning_en, 'vn': meaning_vn, 'my': meaning_my}],
                    'notes': notes
                })
    return results

n1_data = read_xlsx_inline('c:/Users/Manoj/Desktop/Japanese-Local-Website-main/JLPT_N1_Grammar_100_Master_Database.xlsx', 'N1')
n2_data = read_xlsx_inline('c:/Users/Manoj/Desktop/Japanese-Local-Website-main/JLPT_N2_Grammar_100_Master_Database.xlsx', 'N2')

new_data = n1_data + n2_data

js_lines = []
js_lines.append('    // ===== New N1/N2 Grammar (From Excel) =====')
for item in new_data:
    js_line = f"    {{ pattern: {repr(item['pattern'])}, meaning: {repr(item['meaning'])}, meaning_vn: {repr(item['meaning_vn'])}, meaning_my: {repr(item['meaning_my'])}, level: '{item['level']}', structure: {repr(item['structure'])}, examples: {json.dumps(item['examples'], ensure_ascii=False)}, notes: {repr(item['notes'])} }},"
    js_lines.append(js_line)

with codecs.open('c:/Users/Manoj/Desktop/Japanese-Local-Website-main/features.js', 'r', 'utf-8') as f:
    content = f.read()

# Remove the old appended block if it exists
old_marker = '    // ===== New N1/N2 Grammar (From Excel) ====='
if old_marker in content:
    content = content[:content.find(old_marker)] + '];\n'

match = re.search(r'var GRAMMAR_DATA = \[.*?\];', content, re.DOTALL)
if match:
    block = match.group(0)
    last_idx = block.rfind('];')
    new_block = block[:last_idx] + '\n' + '\n'.join(js_lines) + '\n];'
    
    new_content = content[:match.start()] + new_block + content[match.end():]
    
    with codecs.open('c:/Users/Manoj/Desktop/Japanese-Local-Website-main/features.js', 'w', 'utf-8') as f:
        f.write(new_content)
    print('Successfully appended', len(new_data), 'items with multi-language to GRAMMAR_DATA in features.js!')
else:
    print('Could not find GRAMMAR_DATA block.')
