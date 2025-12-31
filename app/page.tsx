"use client";

import SpotlightSearch from "@/components/dashboard/SpotlightSearch";
import GravityGrid from "@/components/dashboard/GravityGrid";
import PrivacyShield from "@/components/detail/PrivacyShield";
import { Mail, Phone } from "lucide-react";
import { useState } from "react";

export default function Home() {
  const [query, setQuery] = useState("");
  const isSearchMode = query.length > 0;

  return (
    <div className="max-w-7xl mx-auto pt-10">
      <div className="text-center mb-16 space-y-2">
        <h1 className="text-4xl font-bold text-white tracking-tight">Candidate Intelligence</h1>
        <p className="text-slate-400">AI-Powered Screening & Risk Analysis</p>
      </div>

      <SpotlightSearch query={query} onQueryChange={setQuery} />

      <div className="mt-20">
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-xl font-semibold text-white">Recent Candidates</h2>
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <span className="w-2 h-2 rounded-full bg-green-500"></span>
            Live Updates
          </div>
        </div>
        <GravityGrid isSearchMode={isSearchMode} />
      </div>

      {/* Privacy Shield Demo */}
      <div className="mt-24 pb-20">
        <h2 className="text-xl font-semibold text-white mb-6">Privacy Shield Demonstration</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <PrivacyShield content={
            <div className="flex items-center gap-4">
              <div className="p-3 bg-white/5 rounded-lg text-primary">
                <Mail size={24} />
              </div>
              <div>
                <p className="text-sm text-slate-400">Primary Email</p>
                <p className="text-lg text-white font-mono">alex.chen.phd@stanford.edu</p>
                <p className="text-xs text-emerald-400 mt-1">Verified via LinkedIn</p>
              </div>
            </div>
          } />

          <PrivacyShield content={
            <div className="flex items-center gap-4">
              <div className="p-3 bg-white/5 rounded-lg text-primary">
                <Phone size={24} />
              </div>
              <div>
                <p className="text-sm text-slate-400">Direct Contact</p>
                <p className="text-lg text-white font-mono">+1 (415) 555-0192</p>
                <p className="text-xs text-slate-500 mt-1">Last active: 2 mins ago</p>
              </div>
            </div>
          } />
        </div>
      </div>
    </div>
  );
}
