"use client"

import * as React from "react"
import { toast } from "sonner"
import { Check, Clock } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

interface WorkflowItem {
    id: string
    title: string
    description: string | null
    internal_notes: string | null
    status: string // "TODO", "DONE", etc.
    priority: string // "NORMAL", "HIGH"
    show_at: string
    dependency_info: string | null
}

interface VsWorkflowProps {
    projectId: string
    apiFetch: (url: string, init?: RequestInit) => Promise<Response>
}

export function VsWorkflow({ projectId, apiFetch }: VsWorkflowProps) {
    const [items, setItems] = React.useState<WorkflowItem[]>([])
    const [loading, setLoading] = React.useState(true)

    const loadItems = React.useCallback(async () => {
        try {
            const res = await apiFetch(`/projects/${projectId}/workflow-items`)
            if (res.ok) {
                setItems((await res.json()) as WorkflowItem[])
            }
        } catch (err) {
            console.error("Failed to load workflow items", err)
        } finally {
            setLoading(false)
        }
    }, [apiFetch, projectId])

    React.useEffect(() => {
        void loadItems()
        const interval = setInterval(() => {
            void loadItems()
        }, 30000) // Poll every 30 seconds for new items
        return () => clearInterval(interval)
    }, [loadItems])

    const updateStatus = async (itemId: string, newStatus: string) => {
        try {
            const res = await apiFetch(`/projects/workflow-items/${itemId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: newStatus }),
            })
            if (res.ok) {
                setItems((prev) =>
                    prev.map((i) => (i.id === itemId ? { ...i, status: newStatus } : i))
                )
                toast.success("Item updated")
            }
        } catch (err) {
            toast.error("Failed to update item")
        }
    }

    if (loading && items.length === 0) {
        return <div className="p-4 text-center">Loading workflow...</div>
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold">VS Amazon Workflow</h2>
                <Badge variant="outline" className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Real-time Chain
                </Badge>
            </div>

            {items.length === 0 ? (
                <Card>
                    <CardContent className="p-8 text-center text-muted-foreground">
                        No workflow items revealed yet. They will appear as the workflow progresses.
                    </CardContent>
                </Card>
            ) : (
                <div className="grid gap-4">
                    {items.map((item) => (
                        <Card key={item.id} className={item.status === "DONE" ? "opacity-60" : ""}>
                            <CardHeader className="pb-2">
                                <div className="flex items-start justify-between">
                                    <div className="space-y-1">
                                        <CardTitle className="text-lg flex items-center gap-2">
                                            {item.title}
                                            {item.priority === "HIGH" && (
                                                <Badge variant="destructive" className="text-[10px] h-4">HIGH</Badge>
                                            )}
                                        </CardTitle>
                                        {item.dependency_info && (
                                            <p className="text-xs text-muted-foreground italic">
                                                {item.dependency_info}
                                            </p>
                                        )}
                                    </div>
                                    <Badge variant={item.status === "DONE" ? "secondary" : "default"}>
                                        {item.status}
                                    </Badge>
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <p className="text-sm line-clamp-3 whitespace-pre-wrap">{item.description}</p>

                                {item.internal_notes && (
                                    <div className="bg-muted/50 p-2 rounded text-xs border-l-2 border-primary">
                                        <strong>Note:</strong> {item.internal_notes}
                                    </div>
                                )}

                                <div className="flex justify-end gap-2 mt-2">
                                    {item.status !== "DONE" && (
                                        <Button
                                            size="sm"
                                            onClick={() => void updateStatus(item.id, "DONE")}
                                            className="gap-2"
                                        >
                                            <Check className="h-4 w-4" />
                                            Mark Done
                                        </Button>
                                    )}
                                    {item.status === "DONE" && (
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => void updateStatus(item.id, "TODO")}
                                        >
                                            Reopen
                                        </Button>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    )
}
