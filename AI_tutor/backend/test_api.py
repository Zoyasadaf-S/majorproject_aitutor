import urllib.request
import json
import uuid

# 1. Login
req = urllib.request.Request(
    'http://127.0.0.1:8000/api/auth/login', 
    data=json.dumps({'email': 'demo@cognilearn.ai', 'password': 'demo123'}).encode('utf-8'),
    headers={'Content-Type': 'application/json'}
)
resp = urllib.request.urlopen(req)
data = json.loads(resp.read().decode('utf-8'))
token = data['access_token']
print('✓ Login successful! Token:', token[:20] + '...')

# 2. Upload text document
boundary = '----WebKitFormBoundaryTest12345'
doc_content = b'Photosynthesis is the process by which green plants make food using sunlight, water, and carbon dioxide. Chlorophyll absorbs solar energy in the chloroplasts. The light-dependent reactions convert light energy into ATP and NADPH. The Calvin cycle uses these to synthesize glucose.'

body = (
    f'--{boundary}\r\n'
    f'Content-Disposition: form-data; name="file"; filename="photosynthesis_guide.txt"\r\n'
    f'Content-Type: text/plain\r\n\r\n'
).encode('utf-8') + doc_content + f'\r\n--{boundary}--\r\n'.encode('utf-8')

req_doc = urllib.request.Request(
    'http://127.0.0.1:8000/api/documents/upload',
    data=body,
    headers={
        'Authorization': f'Bearer {token}',
        'Content-Type': f'multipart/form-data; boundary={boundary}'
    }
)
resp_doc = urllib.request.urlopen(req_doc)
doc_res = json.loads(resp_doc.read().decode('utf-8'))
print('✓ Document upload successful:', doc_res)

# 3. Retrieve user documents
req_list = urllib.request.Request(
    'http://127.0.0.1:8000/api/documents',
    headers={'Authorization': f'Bearer {token}'}
)
resp_list = urllib.request.urlopen(req_list)
doc_list = json.loads(resp_list.read().decode('utf-8'))
print('✓ User documents list:', len(doc_list), 'document(s)')

# 4. Clean up test document
doc_id = doc_res['document_id']
req_del = urllib.request.Request(
    f'http://127.0.0.1:8000/api/documents/{doc_id}',
    headers={'Authorization': f'Bearer {token}'},
    method='DELETE'
)
resp_del = urllib.request.urlopen(req_del)
print('✓ Document delete test:', json.loads(resp_del.read().decode('utf-8')))

print('\n*** ALL TESTS PASSED SUCCESSFULLY! ***')
