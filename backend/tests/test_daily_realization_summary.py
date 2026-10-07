"""M3 must consume the same department metrics and total as Realization."""
import json
from pathlib import Path
import shutil
import subprocess
import unittest

from app.services.daily_realization_metrics import calculate_daily_metrics, combine_daily_metrics


def planned(classification, **values):
    return {"in_original_plan": True, "classification": classification, **values}


class DailyRealizationSummaryTests(unittest.TestCase):
    def test_total_preserves_department_extra_weights(self):
        dev = [planned("REALIZED_AS_PLANNED", daily_share=0.25),
               {"in_original_plan": False, "classification": "ADDITIONAL_COMPLETED"}]
        gd = [planned("IN_PROGRESS")] * 3
        departments = [calculate_daily_metrics(dev), calculate_daily_metrics(gd)]
        total = combine_daily_metrics(departments)
        self.assertEqual(total["realization_credit"], 0.5)
        self.assertEqual(total["raw_plan_realization"], 15.4)
        # Recalculating the combined tasks would incorrectly reweight the extra.
        self.assertEqual(calculate_daily_metrics(dev + gd)["raw_plan_realization"], 32.7)
        self.assertEqual(total["realization_items"],
                         departments[0]["realization_items"] + departments[1]["realization_items"])

    def test_empty_and_single_department(self):
        self.assertEqual(combine_daily_metrics([]), calculate_daily_metrics([]))
        authoritative = {**calculate_daily_metrics([]), "raw_plan_realization": 37.1}
        self.assertEqual(combine_daily_metrics([authoritative]), authoritative)

    @unittest.skipUnless(shutil.which("node"), "Node is needed to compare the dashboard's actual function")
    def test_matches_realization_dashboard_function(self):
        scenarios = [
            [[]],
            [[], []],
            [[planned("REALIZED_AS_PLANNED", daily_share=0.25),
              {"classification": "ADDITIONAL_COMPLETED"}], [planned("IN_PROGRESS")] * 3],
            [[planned("REALIZED_AS_PLANNED")], [planned("NO_PROGRESS")] * 3],
            [[planned("POSTPONED_APPROVED", deadline_was_today=True, deadline_critical=True)],
             [planned("REALIZED_AS_PLANNED", deadline_was_today=True, deadline_completed=True),
              {"classification": "ADDITIONAL_COMPLETED"}]],
            [[{"classification": "ADDITIONAL_COMPLETED"}], [{"classification": "ADDITIONAL_COMPLETED"}] * 2],
        ]
        reports = [[calculate_daily_metrics(rows) for rows in scenario] for scenario in scenarios]
        frontend = Path(__file__).resolve().parents[2] / "frontend"
        script = """
            const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript');
            function load(file, imports = {}) {
                const module = {exports: {}};
                const {outputText} = ts.transpileModule(fs.readFileSync(file, 'utf8'),
                    {compilerOptions: {module: ts.ModuleKind.CommonJS}});
                vm.runInNewContext(outputText, {module, exports: module.exports,
                    require: name => imports[name]});
                return module.exports;
            }
            const percent = load('src/lib/weekly-realization-percent.ts');
            const {combineDailyRealization} = load('src/lib/daily-realization-summary.ts',
                {'@/lib/weekly-realization-percent': percent});
            const scenarios = JSON.parse(fs.readFileSync(0, 'utf8'));
            process.stdout.write(JSON.stringify(scenarios.map(metrics =>
                combineDailyRealization(metrics.map(metrics => ({metrics, people: [],
                    last_updated: '', baseline_available: true}))).metrics)));
        """
        result = subprocess.run([shutil.which("node"), "-e", script], cwd=frontend,
                                input=json.dumps(reports), text=True, capture_output=True, check=True)
        self.assertEqual([combine_daily_metrics(scenario) for scenario in reports], json.loads(result.stdout))
