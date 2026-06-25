# FileAccessDashboard Internal API

Base URL:

`	ext
http://192.168.10.8:5080
`

Authentication:

Use either header:

`http
Authorization: Bearer XeiMrYgncS2EkpQZ4tTqs73RfIU8Cub91oAwB5zPxyjOJDVd
`

or:

`http
X-FileAccess-Api-Key: XeiMrYgncS2EkpQZ4tTqs73RfIU8Cub91oAwB5zPxyjOJDVd
`

Keep this token internal. Do not expose publicly.

## Health

`http
GET /api/health
`

Returns mode, roots, and status.

## Folders

Top-level folders or search:

`http
GET /api/folders?limit=100
GET /api/folders?search=BEGROS&limit=100
`

Get one folder:

`http
GET /api/folders/{id}
`

Get direct children:

`http
GET /api/folders/{id}/children
`

Folder response shape:

`json
{
  "id": 1,
  "fullPath": "F:\\FILES",
  "relativePath": "FILES",
  "folderName": "FILES",
  "parentFolderId": null,
  "isManaged": true,
  "accessGroupName": null,
  "hasChildren": true
}
`

## Users

`http
GET /api/users
GET /api/users?search=EH
`

Create/import/reset user:

`http
POST /api/users
Content-Type: application/json

{
  "samAccountName": "EH",
  "displayName": "EH",
  "password": "Primex1!"
}
`

For importing an existing enabled Windows user, omit password.

## Access

List access records:

`http
GET /api/access
GET /api/access?folderId=123
GET /api/access?userId=4
`

Assign access:

`http
POST /api/access/assign
Content-Type: application/json

{
  "folderId": 123,
  "samAccountName": "EH",
  "reason": "Approved request #987"
}
`

Alternative by path:

`json
{
  "folderPath": "F:\\FILES\\10_ZHVILLIM\\05_CLIENTS\\02_STD",
  "samAccountName": "EH"
}
`

Remove access:

`http
POST /api/access/remove
Content-Type: application/json

{
  "folderId": 123,
  "samAccountName": "EH"
}
`

Preview:

`http
POST /api/access/preview
Content-Type: application/json

{
  "folderId": 123,
  "samAccountName": "EH"
}
`

## Audit

`http
GET /api/audit?limit=100
GET /api/audit?folderId=123&limit=100
`

## Integration recommendation

The task-management app should store access requests and approvals. When an admin approves, its backend should call POST /api/access/assign. Do not let the browser expose the API token directly unless this is strictly internal-only and acceptable. Preferred: task app backend calls this API server-to-server.
