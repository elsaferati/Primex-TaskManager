from datetime import datetime, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from app.models.vs_workflow_item import VsWorkflowItem

# Hardcoded workflow definition for VS Amazon projects
# offsets are in minutes for immediate testing
VS_AMAZON_WORKFLOW = [
    {"title": "Download product images and price listing", "offset_minutes": 2, "description": "Download product images and price listing from your Seller account or from the website itself. Also, collect any relevant product details."},
    {"title": "Remove background and create white background", "offset_minutes": 5, "description": "Remove the existing background from the images and place the products on a clean, solid white background.", "dependency": "Download product images and price listing"},
    {"title": "Check spelling and grammar of product titles", "offset_minutes": 10, "description": "Review the product titles for any spelling or grammatical errors to ensure clarity and professionalism."},
    {"title": "Optimize product descriptions for search engines", "offset_minutes": 20, "description": "Incorporate relevant keywords and phrases into the product descriptions to improve search engine visibility.", "dependency": "Check spelling and grammar of product titles"},
    {"title": "Resize images for specific marketplace requirements", "offset_minutes": 30, "description": "Resize the product images to meet the specific requirements of the chosen online marketplace."},
    {"title": "Create enhanced brand content (A+) if applicable", "offset_minutes": 45, "description": "Develop visually appealing EBC or A+ content to provide customers with more detailed product information."},
    {"title": "Generate product lifestyle images with AI tools", "offset_minutes": 60, "description": "Use AI-powered tools to create engaging lifestyle images that show the product in use.", "dependency": "Resize images for specific marketplace requirements"},
    {"title": "Prepare product data for bulk upload", "offset_minutes": 90, "description": "Organize the product information into a format suitable for bulk uploading to the marketplace."},
    {"title": "Execute product listing update on the marketplace", "offset_minutes": 120, "description": "Upload the updated product information and images to the online marketplace.", "dependency": "Prepare product data for bulk upload"},
    {"title": "Monitor listing performance and customer feedback", "offset_minutes": 180, "description": "Regularly track the performance of the listings and address any customer questions or reviews."},
    {"title": "Apply SEO adjustments based on performance data", "offset_minutes": 300, "description": "Refine the product titles and descriptions based on initial performance data and customer search behavior.", "dependency": "Monitor listing performance and customer feedback"},
    {"title": "Schedule periodic listing review and optimization", "offset_minutes": 1440, "description": "Set up a recurring task to review and further optimize the product listings over time."},
]

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
            show_after_minutes=step["offset_minutes"],
            show_at=show_at,
            dependency_info=step.get("dependency"),
            status="TODO",  # Plain string
            priority="NORMAL"  # Plain string
        )
        items.append(item)
    
    db.add_all(items)
    await db.flush()

async def get_active_workflow_items(db: AsyncSession, project_id: str):
    """
    Retrieves workflow items that are scheduled to be shown (show_at <= now).
    """
    now = datetime.now()
    query = select(VsWorkflowItem).where(
        and_(
            VsWorkflowItem.project_id == project_id,
            VsWorkflowItem.show_at <= now
        )
    ).order_by(VsWorkflowItem.show_at.asc())
    
    result = await db.execute(query)
    return result.scalars().all()
