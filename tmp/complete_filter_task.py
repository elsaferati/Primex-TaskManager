"""Complete the exact filter-cleaning task through the hosted API, as requested."""
import asyncio
import json
import sys
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
from app.config import settings
from app.services.primeflow_report import PrimeFlowClient

TASK_ID = '6d1e6551-7c68-4e2a-b920-674344ef32bb'
ASSIGNEE_ID = '8d8a08f3-3aa2-43ab-b1a8-1247cb6fbf95'
TITLE = 'PASTRIMI I FILTERAVE TE NXEMJESE CDO DY JAVE DIKUSH DETYRE'

async def main():
    base = 'https://api-flow.primexeu.com'
    async with httpx.AsyncClient(base_url=base, timeout=30) as client:
        login = PrimeFlowClient(base, settings.PRIMEFLOW_EMAIL or settings.ADMIN_EMAIL,
            settings.PRIMEFLOW_PASSWORD or settings.ADMIN_PASSWORD, settings.PRIMEFLOW_ACCESS_TOKEN)
        token = await login._token(client)
        headers = {'Authorization': f'Bearer {token}'}
        response = await client.get(f'/api/tasks/{TASK_ID}', headers=headers)
        response.raise_for_status()
        task = response.json()
        assert task['title'] == TITLE, 'Task title differs; refusing update'
        assert task['assigned_to'] == ASSIGNEE_ID, 'Assignee differs; refusing update'
        assert task['is_active'], 'Task is inactive; refusing update'
        if task['status'] != 'DONE':
            response = await client.patch(f'/api/tasks/{TASK_ID}', headers=headers, json={
                'status': 'DONE',
                'completion_override_reason': 'Mbyllur me kerkese te perdoruesit per Diellza Veliun, permes Codex.'
            })
            if not response.is_success:
                print('UPDATE_FAILED', response.status_code, response.text[:1200])
                response.raise_for_status()
        response = await client.get(f'/api/tasks/{TASK_ID}', headers=headers)
        response.raise_for_status()
        result = response.json()
        assert result['status'] == 'DONE', 'Completion verification failed'
        assert result['assigned_to'] == ASSIGNEE_ID, 'Assignee changed unexpectedly'
        print(json.dumps({key: result.get(key) for key in ('id', 'title', 'assigned_to', 'status', 'completed_at')}, ensure_ascii=True))

if __name__ == '__main__':
    asyncio.run(main())
