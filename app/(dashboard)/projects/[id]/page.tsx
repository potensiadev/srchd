
"use client";

import { useState, useEffect, use, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Clock, Download, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import CandidateGrid from "@/components/dashboard/CandidateGrid";
import { Badge } from "@/components/ui/badge";

interface Project {
    id: string;
    name: string;
    description: string | null;
    status: string;
    created_at: string;
}

interface ProjectCandidate {
    id: string;
    name: string;
    last_position: string | null;
    last_company: string | null;
    skills: string[];
    exp_years: number;
    confidence_score: number;
}

export default function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const router = useRouter();
    const [project, setProject] = useState<Project | null>(null);
    const [candidates, setCandidates] = useState<ProjectCandidate[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const fetchProjectDetails = useCallback(async () => {
        try {
            const res = await fetch(`/api/projects/${id}`);
            if (res.ok) {
                const data = await res.json();
                setProject(data.data.project);
                setCandidates(data.data.candidates);
            } else {
                console.error("Failed to load project");
            }
        } catch (error) {
            console.error("Error loading project:", error);
        } finally {
            setIsLoading(false);
        }
    }, [id]);

    useEffect(() => {
        fetchProjectDetails();
    }, [fetchProjectDetails]);

    if (isLoading) {
        return <div className="p-8 text-center">Loading project...</div>;
    }

    if (!project) {
        return <div className="p-8 text-center">Project not found</div>;
    }

    return (
        <div className="flex flex-col h-screen overflow-hidden bg-gray-50/30">
            {/* Header */}
            <div className="flex-none px-8 py-6 border-b border-gray-100 bg-white z-10">
                <div className="max-w-7xl mx-auto w-full">
                    <Button
                        variant="ghost"
                        className="mb-4 pl-0 text-gray-400 hover:text-gray-900"
                        onClick={() => router.push("/projects")}
                    >
                        <ArrowLeft size={16} className="mr-2" />
                        Back to Projects
                    </Button>

                    <div className="flex justify-between items-start">
                        <div>
                            <div className="flex items-center gap-3 mb-2">
                                <h1 className="text-3xl font-bold tracking-tight text-gray-900">
                                    {project.name}
                                </h1>
                                <Badge variant="secondary" className="bg-indigo-50 text-indigo-700 hover:bg-indigo-100">
                                    {project.status}
                                </Badge>
                            </div>
                            <p className="text-gray-500 max-w-2xl">
                                {project.description || "No description provided."}
                            </p>
                            <div className="flex items-center gap-2 mt-4 text-xs text-gray-400">
                                <Clock size={14} />
                                <span>Created {new Date(project.created_at).toLocaleDateString()}</span>
                            </div>
                        </div>

                        <div className="flex gap-2">
                            <Button variant="outline" className="gap-2">
                                <Share2 size={16} />
                                Share
                            </Button>
                            <Button className="gap-2 bg-gray-900 text-white hover:bg-black">
                                <Download size={16} />
                                Export Blind PDF
                            </Button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Content Grid */}
            <div className="flex-1 overflow-y-auto p-8">
                <div className="max-w-7xl mx-auto">
                    <div className="mb-6 flex items-center justify-between">
                        <h2 className="text-lg font-semibold text-gray-900">
                            Saved Candidates <span className="text-gray-400 font-normal ml-1">({candidates.length})</span>
                        </h2>
                        {/* Can add sort/filter here later */}
                    </div>

                    <CandidateGrid
                        searchResults={candidates}
                        isSearching={false}
                    />
                </div>
            </div>
        </div>
    );
}
