"use client";

import LevitatingCard, { TalentProps } from "./LevitatingCard";

const MOCK_CANDIDATES: TalentProps[] = [
    { id: 1, name: "Elena Fisher", role: "Senior UX Designer", aiConfidence: 98, matchScore: 0, riskLevel: "low" },
    { id: 2, name: "Marcus Reed", role: "Frontend Architect", aiConfidence: 94, matchScore: 0, riskLevel: "medium" },
    { id: 3, name: "Sarah Connor", role: "Security Analyst", aiConfidence: 89, matchScore: 0, riskLevel: "high" }, // Risk
    { id: 4, name: "John Doe", role: "Product Manager", aiConfidence: 91, matchScore: 0, riskLevel: "low" },
    { id: 5, name: "Jane Smith", role: "Backend Engineer", aiConfidence: 96, matchScore: 0, riskLevel: "low" },
    { id: 6, name: "Alex Chen", role: "Data Scientist", aiConfidence: 85, matchScore: 0, riskLevel: "medium" },
];

export default function GravityGrid({ isSearchMode = false }: { isSearchMode?: boolean }) {
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pb-20">
            {MOCK_CANDIDATES.map((candidate, index) => (
                <LevitatingCard
                    key={candidate.id}
                    data={candidate}
                    index={index}
                    isSearchMode={isSearchMode}
                />
            ))}
        </div>
    );
}
