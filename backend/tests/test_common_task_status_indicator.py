from pathlib import Path
import subprocess


FRONTEND = Path(__file__).resolve().parents[2] / "frontend"


def test_status_indicators_render_actual_status_and_handle_missing_status():
    result = subprocess.run([
        "node", "-e", r'''
const fs = require('fs');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const assert = require('node:assert/strict');
const source = fs.readFileSync('src/app/(app)/common/page.tsx', 'utf8');
const normalization = source.split('const normalizeCommonTaskStatus =')[1].split('const isWaitingClientTask')[0];
const renderer = source.split('const renderCommonTaskStatusIndicator =')[1].split('type CommonColorFilter')[0];
const code = ts.transpileModule(
  'const normalizeCommonTaskStatus =' + normalization +
  'const renderCommonTaskStatusIndicator =' + renderer,
  {compilerOptions: {jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2020}}
).outputText;
const render = new Function('React', code + '; return renderCommonTaskStatusIndicator;')(React);
for (const [status, label, tone] of [
  ['TODO', 'To do', 'todo'], ['IN_PROGRESS', 'In progress', 'in-progress'],
  ['DONE', 'Done', 'done'], ['WAITING_CONFIRMATION', 'Waiting confirmation', 'waiting'],
  ['WAITING_CLIENT', 'Waiting client', 'waiting-client'],
]) {
  for (const personal of [false, true]) {
    const markup = renderToStaticMarkup(render({status, isDeadlineImportant: !personal}, personal));
    assert.ok(markup.includes(label));
    assert.ok(markup.includes('status-' + tone));
    assert.ok(markup.includes('aria-label="Status: ' + label + '"'));
    assert.ok(markup.includes('title="Status: ' + label + '"'));
    assert.ok(markup.includes('>' + label + '<'));
  }
}
assert.equal(render({status: 'DONE'}), null);
assert.equal(render({isDeadlineImportant: true}), null);
assert.equal(render({status: 'UNKNOWN', isDeadlineImportant: true}), null);
assert.ok(renderToStaticMarkup(render({isDone: true}, true)).includes('Done'));
assert.ok(renderToStaticMarkup(render({status: 'TO_DO'}, true)).includes('To do'));
// Parse the whole page too, to catch malformed TSX at integration sites.
const file = ts.createSourceFile('page.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
assert.equal(file.parseDiagnostics.length, 0);
'''
    ], cwd=FRONTEND, capture_output=True, text=True)
    assert result.returncode == 0, result.stderr


def test_indicators_are_wired_to_day_and_week_views_with_independent_colors():
    source = (FRONTEND / "src/app/(app)/common/page.tsx").read_text(encoding="utf-8")
    assert source.count("{renderCommonTaskStatusIndicator(e)}") == 2
    assert "{renderCommonTaskStatusIndicator(e, true)}" in source
    assert "renderCommonTaskStatusIndicator(cell, isPersonalRowId(row.id))" in source
    assert source.count("{taskStatusIndicator}") == 2
    assert "!cell.assignees?.length && !cell.assigneeLabels?.length ? taskStatusIndicator : null" in source
    assert "const taskStatusIndicator = !cell.placeholder && isFastTaskRowId(row.id)" in source
    style = source.split(".common-task-status-indicator {", 1)[1].split("}", 1)[0]
    assert "background: #fff !important" in style
    assert "color: #475569 !important" in style
    assert "width: fit-content" in style
    assert "padding: 1px 3px" in style
    assert "font-size: 9px" in style
    for status, color in (("todo", "#fbcfe8"), ("in-progress", "#fef08a"), ("done", "#bbf7d0")):
        rule = source.split(f".common-task-status-indicator.status-{status} {{", 1)[1].split("}", 1)[0]
        assert f"background: {color} !important" in rule
