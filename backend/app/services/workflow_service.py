from datetime import datetime, timedelta, timezone
import re
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from app.models.vs_workflow_item import VsWorkflowItem

# Hardcoded workflow definition for VS Amazon projects
# offsets are in minutes for immediate testing
VS_AMAZON_WORKFLOW = [
    {
        "title": "ANALIZIMI DHE IDENTIFIKIMI I KOLONAVE",
        "offset_minutes": 0,
        "priority": "HIGH",
        "description": (
            "Pas pranimit të projektit të ri nga furnitori, analizohen të gjitha informatat e pranuara, "
            "duke identifikuar të dhënat që mungojnë si dhe rastet e reja. Pas kësaj faze, përcaktohen "
            "kolonat (informatat) që mungojnë dhe plotësohen përmes burimeve të ndryshme në web ose "
            "I ipen zhvillimit per ti gjetur te dhenat me agjent. Në rast se informatat gjenerohen nga "
            "agjentët, ato kontrollohen dhe manualisht.\n"
            "1. REGJ: VS/VL\n"
            "2.PATH: V:\\20_VS\n"
            "3.CHECK: V:\\20_VS\\01_CHECKLISTA\\AMAZON\\FINAL \n"
            "4.TRAJNIM: 0\n"
            "5. BZ GROUP: VS_EMRI I FURNITORIT\n"
        ),
        "dependency": "KOMPLET E PAVARUR",
        "internal_notes": (
            "Assignees: elza.preniqi/ enesa.sharku\n"
            "Notes: SHFAQET MENJEHER PAS KRIJIMIT TE DETYRES DHE ZGJAT 2 DITE\n"
            "Checklist: CHECKLIST FOR VS AMAZON_FINAL_10_10_2025"
        ),
    },
    {
        "title": "PLOTËSIMI I TEMPLATE-IT TË AMAZONIT",
        "offset_minutes": 2,
        "priority": "HIGH",
        "description": (
            "Pas sigurimit të informatave të nevojshme, bëhet plotësimi i kolonave në template-in e "
            "Amazon-it. Në to vendosen informatat që kanë munguar dhe janë siguruar përmes web-it ose "
            "agjentit, si dhe të dhënat që gjenden në produktdaten (dokumentet) e dërguara nga klienti, "
            "të përshtatura sipas rregullave dhe standardeve të Amazon-it.1. \n"
            "1. REGJ: VS/VL\n"
            "2.PATH: V:\\20_VS\\00_TEMPLATE\\BLANK\\AMAZON\\FINAL\n"
            "3.CHECK: V:\\20_VS\\01_CHECKLISTA\\AMAZON\\FINAL \n"
            "4.TRAJNIM: 0\n"
            "5.BZ GROUP: VS_EMRI I FURNITORIT"
        ),
        "dependency": 'E VARUR NGA DET.1 "ANALIZIMI DHE IDENTIFIKIMI I KOLONAVE"',
        "internal_notes": (
            "Assignees: elza.preniqi/ enesa.sharku\n"
            "Notes: SHFAQET 2 DIT PAS DATES SE KRIJIMIT"
        ),
    },
    {
        "title": "KALKULIMI I CMIMEVE",
        "offset_minutes": 3,
        "priority": "HIGH",
        "description": (
            "Fillimisht cmimet e dërguara nga VS kontrollohen për të parë nëse ka ndonjë mungesë; në rast "
            "se ka mungesa, ato i dërgohen VS-se për sigurimin e cmimeve. Më pas produktet ndahen në dy "
            "Excel-a të veçantë: pijet dhe feinkost. Në secilin Excel vendosen numrat e artikujve dhe "
            "çmimet përkatëse, të cilët më pas ngarkohen në Platforme. Excel-i i pijeve llogaritet me "
            "normal price, ndërsa ai i feinkost-it (ushqime) me feinkost prices. Pas këtij procesi, "
            "gjenerohet automatikisht Excel-i me çmime për sasi 01, 03, 06 dhe 12, dhe këto çmime "
            "vendosen në template-in e Amazon-it.\n"
            "1. REGJ: VS/VL\n"
            "2.PATH: V:\\20_VS\\00_TEMPLATE\\FILLED\\AMAZON\\FINAL\\PRICES\n"
            "3.CHECK: V:\\20_VS\\01_CHECKLISTA\\AMAZON\\FINAL \n"
            "4.TRAJNIM: 0\n"
            "5.BZ GROUP: VS_EMRI I FURNITORIT"
        ),
        "dependency": "KOMPLET E PAVARUR",
        "internal_notes": (
            "Assignees: enesa.sharku\n"
            "Notes: SHFAQET 3 DIT PAS DATES SE KRIJIMIT"
        ),
    },
    {
        "title": "GJENERIMI I FOTOVE",
        "offset_minutes": 3,
        "priority": "HIGH",
        "description": (
            "Fillimisht Fotot e dërguara nga VS kontrollohen për të parë nëse ka ndonjë mungesë; në rast "
            "se ka mungesa, ato i dërgohen VS-se për sigurimin e fotove. Më pas bëhet kontrollimi i "
            "fotove nëse përmbajnë kuti druri, vite(ne shishe) apo kanaqe dhe ato modifikohen/editohen. "
            "Fotot pranohen përmes listës në Excel ose në formatet PNG/JPG. Këto foto kthehen në linka "
            "URL (përmes Python-it, sipas checklistës se fotove) dhe këta linka vendosen në template-in "
            "për Amazon.\n"
            "1. REGJ: VS/VL\n"
            "2.PATH: V:\\20_VS\\00_TEMPLATE\\FILLED\\AMAZON\\FINAL\\PICTURE\n"
            "3.CHECK: V:\\20_VS\\01_CHECKLISTA\\AMAZON\\FINAL\n"
            "4.TRAJNIM: 0\n"
            "5.BZ GROUP: VS_EMRI I FURNITORIT\n"
        ),
        "dependency": "KOMPLET E PAVARUR",
        "internal_notes": (
            "Assignees: elza.preniqi\n"
            "Notes: SHFAQET 3 DIT PAS DATES SE KRIJIMIT\n"
            "Checklist: CHECKLIST FOR VS IMAGES_FINAL_15_10_2025"
        ),
    },
    {
        "title": "KO1 E PROJEKTIT VS",
        "offset_minutes": 4,
        "priority": "HIGH",
        "description": (
            "Pas perfundimit te projektit behet kontrolla e te gjitha kolonave nese ka blanks. Dhe "
            "vazhdohet me kontrollen e projektit permes checklistes per Amazon VS\n"
            "1. REGJ: VS/VL\n"
            "2.PATH: V:\\20_VS\n"
            "3.CHECK: V:\\20_VS\\01_CHECKLISTA\\AMAZON\\FINAL \n"
            "4.TRAJNIM: 0\n"
        ),
        "dependency": "E VARUR NGA 1, 2, 3, 4",
        "internal_notes": (
            "Assignees: elza.preniqi\n"
            "Notes: SHFAQET 4 DIT PAS DATES SE KRIJIMIT\n"
            "Checklist: CHECKLIST FOR VS AMAZON_FINAL_10_10_2025"
        ),
    },
    {
        "title": "KO2 E PROJEKTIT VS",
        "offset_minutes": 4,
        "priority": "HIGH",
        "description": (
            "Pas kontrolles se pare te projektit VS behet kontrolla e dyte finale sipas checklistes "
            "per Amazon VS\n"
            "1. REGJ: VS/VL\n"
            "2.PATH: V:\\20_VS\n"
            "3.CHECK: V:\\20_VS\\01_CHECKLISTA\\AMAZON\\FINAL \n"
            "4.TRAJNIM: 0\n"
            "5.BZ GROUP: VS_EMRI I FURNITORIT"
        ),
        "dependency": "E VARUR NGA 1, 2, 3, 4,5",
        "internal_notes": (
            "Assignees: diellza.veliu\n"
            "Notes: SHFAQET 4 DIT PAS DATES SE KRIJIMIT"
        ),
    },
    {
        "title": "KONTROLLIMI I PROD. EGZSISTUESE DHE POSTIMI NË AMAZON",
        "offset_minutes": 5,
        "priority": "HIGH",
        "description": (
            "Behet kontrolla e produkteve  ekzistuese në Amazon. Në përputhje me rregullat dhe kërkesat "
            "e klientit, fshihen produktet që janë të njëjta ose duplikatë me ato që planifikohen për "
            "postim. Më pas realizohet postimi i produkteve në Amazon. Pas postimit, identifikohen "
            "error-at, bëhet rregullimi i tyre dhe produktet ripostohen derisa procesi të përfundojë "
            "pa asnjë error.\n"
        ),
        "dependency": "E VARUR NGA 6",
        "internal_notes": (
            "Assignees: elza.preniqi/ enesa.sharku\n"
            "Notes: SHFAQET 5 DIT PAS DATES SE KRIJIMIT\n"
            "Checklist: CHECKLIST FOR VS AMAZON_FINAL_10_10_2025"
        ),
    },
    {
        "title": "DREAM ROBOT VS",
        "offset_minutes": 6,
        "priority": "HIGH",
        "description": (
            "Plotësohet template-i për Dream Robot për VS. Kontrollohen produktet ekzistuese dhe bëhet "
            "fshirja e tyre. Pas përfundimit të kontrollit, produktet postohen dhe realizohet lidhja "
            "e tyre me variacione. Më pas, produktet e vjetra (me prefix-e në fund) lidhen me produktet "
            "e reja që janë postuar. \n"
            "1. REGJ: VS/VL\n"
            "2.PATH: V:\\20_VS\\00_TEMPLATE\\BLANK\\DREAM ROBOT\\FINAL\n"
            "3.CHECK: V:\\20_VS\\01_CHECKLISTA\\DREAMROBOT\\FINAL\n"
            "4.TRAJNIM: 0\n"
            "5.BZ GROUP: VS_EMRI I FURNITORIT"
        ),
        "dependency": "E VARUR NGA 7",
        "internal_notes": (
            "Assignees: enesa.sharku\n"
            "Notes: SHFAQET 6 DIT PAS DATES SE KRIJIMIT\n"
            "Checklist: CHECKLIST FOR VS DREAM ROBOT_FINAL_16_10_2025"
        ),
    },
    {
        "title": "DREAM ROBOT VL",
        "offset_minutes": 6,
        "priority": "HIGH",
        "description": (
            "Plotësohet template-i për Dream Robot për VL. Kontrollohen produktet ekzistuese dhe bëhet "
            "fshirja e tyre. Pas përfundimit të kontrollit, produktet postohen dhe realizohet lidhja "
            "e tyre me variacione. Më pas, produktet e vjetra (me prefix-e në fund) lidhen me produktet "
            "e reja që janë postuar. \n"
            "1. REGJ: VS/VL\n"
            "2.PATH: V:\\26_VL\\00_TEMPLATES\\BLANK TEMPLATE\\DREAM ROBOT\\FINAL\n"
            "3.CHECK: V:\\26_VL\\01_CHECKLISTA\\FINAL\\DREAMROBOT\n"
            "4.TRAJNIM: 0\n"
            "5.BZ GROUP: VS_EMRI I FURNITORIT"
        ),
        "dependency": "E VARUR NGA 7",
        "internal_notes": (
            "Assignees: elza.preniqi\n"
            "Notes: SHFAQET 6 DIT PAS DATES SE KRIJIMIT\n"
            "Checklist: CHECKLIST FOR VL DREAM ROBOT&AMAZON_FINAL"
        ),
    },
    {
        "title": "KALKULIMI I PESHAVE",
        "offset_minutes": 6,
        "priority": "HIGH",
        "description": (
            "Fillimisht peshat e dërguara nga VS kontrollohen për të parë nëse ka ndonjë mungesë; në rast "
            "se ka mungesa, ato i dërgohen VS-se për sigurimin e peshave. Më pas, peshat vendosen në "
            "template-in përkatës dhe bëhet kalkulimi i peshës totale të produkteve për sasi 01, 03, 06 "
            "dhe 12. Në fund, këto të dhëna vendosen në template-in e Dream Robot\n"
            "1. REGJ: VS/VL\n"
            "2.PATH: V:\\20_VS\\00_TEMPLATE\\FILLED\\DREAM ROBOT\\FINAL\\WEIGHT\n"
            "3.CHECK: V:\\20_VS\\01_CHECKLISTA\\DREAMROBOT\\FINAL\n"
            "4.TRAJNIM: 0\n"
            "5.BZ GROUP: VS_EMRI I FURNITORIT"
        ),
        "dependency": "KOMPLET E PAVARUR",
        "internal_notes": (
            "Assignees: enesa.sharku\n"
            "Notes: SHFAQET 6 DIT PAS DATES SE KRIJIMIT\n"
            "Checklist: CHECKLIST FOR VS DREAM ROBOT_FINAL_16_10_2025"
        ),
    },
]

AMAZON_STAGE_ONE_TITLES = [
    "ANALIZIMI DHE IDENTIFIKIMI I KOLONAVE",
    "PLOTËSIMI I TEMPLATE-IT TË AMAZONIT",
    "KALKULIMI I CMIMEVE",
    "GJENERIMI I FOTOVE",
]
CHECK_STAGE_TITLES = [
    "KO1 E PROJEKTIT VS",
    "KO2 E PROJEKTIT VS",
]
AMAZON_STAGE_TWO_TITLES = [
    "KONTROLLIMI I PROD. EGZSISTUESE DHE POSTIMI NË AMAZON",
]
DREAMROBOT_STAGE_TITLES = [
    "KALKULIMI I PESHAVE",
    "DREAM ROBOT VS",
    "DREAM ROBOT VL",
]

_DEPENDENCY_NUMBER_RE = re.compile(r"\d+")
_DEPENDENCY_QUOTE_RE = re.compile(r"\"([^\"]+)\"")


def _normalize_title(value: str) -> str:
    return " ".join(value.strip().lower().split())


def dependency_titles_from_info(info: str | None) -> list[str]:
    if not info:
        return []
    titles: list[str] = []
    numbers = [int(n) for n in _DEPENDENCY_NUMBER_RE.findall(info)]
    for number in numbers:
        index = number - 1
        if 0 <= index < len(VS_AMAZON_WORKFLOW):
            titles.append(VS_AMAZON_WORKFLOW[index]["title"])
    quoted = _DEPENDENCY_QUOTE_RE.findall(info)
    if quoted:
        for q in quoted:
            for step in VS_AMAZON_WORKFLOW:
                if q.strip() and q.strip().lower() in step["title"].lower():
                    titles.append(step["title"])
    for step in VS_AMAZON_WORKFLOW:
        if step["title"] in info:
            titles.append(step["title"])
    return list(dict.fromkeys(titles))


def dependency_item_ids_from_info(
    info: str | None, items: list[VsWorkflowItem]
) -> list[str]:
    if not info or not items:
        return []
    ordered_items = sorted(items, key=lambda item: item.created_at or datetime.min)
    normalized_map = {_normalize_title(item.title): item.id for item in ordered_items}
    dependency_ids: list[str] = []

    numbers = [int(n) for n in _DEPENDENCY_NUMBER_RE.findall(info)]
    for number in numbers:
        index = number - 1
        if 0 <= index < len(ordered_items):
            dependency_ids.append(ordered_items[index].id)

    titles = dependency_titles_from_info(info)
    for title in titles:
        key = _normalize_title(title)
        if key in normalized_map:
            dependency_ids.append(normalized_map[key])

    for item in ordered_items:
        if item.title and item.title in info:
            dependency_ids.append(item.id)

    return list(dict.fromkeys(dependency_ids))


def _items_by_titles(
    items: list[VsWorkflowItem], titles: list[str]
) -> list[VsWorkflowItem]:
    normalized_lookup: dict[str, VsWorkflowItem] = {}
    for item in items:
        normalized_lookup[_normalize_title(item.title)] = item
    ordered: list[VsWorkflowItem] = []
    for title in titles:
        key = _normalize_title(title)
        if key in normalized_lookup:
            ordered.append(normalized_lookup[key])
    return ordered


def resolve_workflow_items(items: list[VsWorkflowItem]) -> list[VsWorkflowItem]:
    stages = [
        AMAZON_STAGE_ONE_TITLES,
        CHECK_STAGE_TITLES,
        AMAZON_STAGE_TWO_TITLES,
        DREAMROBOT_STAGE_TITLES,
    ]
    for stage_titles in stages:
        stage_items = _items_by_titles(items, stage_titles)
        if not stage_items:
            continue
        if any(item.status != "DONE" for item in stage_items):
            return stage_items
    return []


async def initialize_vs_workflow(db: AsyncSession, project_id: str):
    """
    Seeds the VS Amazon workflow items for a new project.
    """
    now = datetime.now()
    
    items = []
    for step in VS_AMAZON_WORKFLOW:
        show_at = now + timedelta(minutes=step["offset_minutes"])
        
        item = VsWorkflowItem(
            project_id=project_id,
            title=step["title"],
            description=step.get("description"),
            internal_notes=step.get("internal_notes"),
            show_after_minutes=step["offset_minutes"],
            show_at=show_at,
            dependency_info=step.get("dependency"),
            status="TODO",  # Plain string
            priority=step.get("priority", "NORMAL")  # Plain string
        )
        items.append(item)
    
    db.add_all(items)
    await db.flush()

async def get_active_workflow_items(db: AsyncSession, project_id: str, phase: str | None = None):
    """
    Retrieves workflow items that are scheduled to be shown (show_at <= now).
    """
    if phase and phase.upper() == "PLANNING":
        return []

    now = datetime.now(timezone.utc)
    result = await db.execute(
        select(VsWorkflowItem).where(VsWorkflowItem.project_id == project_id)
    )
    all_items = result.scalars().all()
    active_items = resolve_workflow_items(all_items)
    visible = [
        item for item in active_items if not item.show_at or item.show_at <= now
    ]
    return visible
