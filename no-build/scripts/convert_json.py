import json

try:
    with open('N2test.json', 'r', encoding='utf-8') as f:
        data = f.read()

    js_content = f"window.N2_MOCK_EXAM = {data};"
    
    with open('n2test_data.js', 'w', encoding='utf-8') as f:
        f.write(js_content)
        
    print("Successfully created n2test_data.js")
except Exception as e:
    print(f"Error: {e}")
