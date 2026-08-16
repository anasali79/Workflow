"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";

interface CandidateResumeFile {
  name: string;
  size: number;
  type: string;
  dataUrl?: string;
  updatedAt?: string;
}

interface CandidateProfile {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  domains: string[];
  experienceLevel: string;
  experienceYears: number;
  location: string;
  preferredJobTypes: string[];
  minSalary: string;
  keySkills: string[];
  resumeText: string;
  resumeFileName?: string;
  resumeFile?: CandidateResumeFile;
  parsedSummary?: {
    overview: string;
    topSkills: string[];
    education: string;
    highlights: string[];
  };
  autoApplyEnabled: boolean;
  minMatchScoreThreshold: number;
  dailyLimit: number;
  updatedAt: string;
}

interface JobOpening {
  id: string;
  title: string;
  company: string;
  domain: string;
  experienceRequired: string;
  location: string;
  jobType: string;
  salaryRange: string;
  postedAt: string;
  freshnessTag: string;
  description: string;
  requiredSkills: string[];
  applyUrl: string;
  matchScore: number;
  matchReasoning: string[];
}

interface JobApplicationLog {
  id: string;
  jobId: string;
  jobTitle: string;
  company: string;
  domain: string;
  appliedAt: string;
  status: "applied" | "interview" | "rejected" | "pending";
  matchScore: number;
  generatedCoverLetter: string;
  customAnswers: Record<string, string>;
  attachedResume?: CandidateResumeFile;
  applicationPortal: string;
  auditLogs: string[];
}

const AVAILABLE_DOMAINS = [
  "Frontend",
  "Backend",
  "Full Stack",
  "AI / ML",
  "DevOps",
  "Mobile Developer",
  "UI / UX Design",
];

const EXPERIENCE_LEVELS = [
  { label: "0-2 years (Fresher / Junior)", value: "0-2 years" },
  { label: "2-5 years (Mid-Level)", value: "2-5 years" },
  { label: "5+ years (Senior Lead)", value: "5+ years" },
];

export default function JobAgentPage() {
  const [activeTab, setActiveTab] = useState<"pipeline" | "jobs" | "profile">("jobs");
  const [loading, setLoading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [applyingJobId, setApplyingJobId] = useState<string | null>(null);
  const [bulkApplying, setBulkApplying] = useState(false);

  // Profile State
  const [profile, setProfile] = useState<CandidateProfile | null>(null);
  const [editingFullName, setEditingFullName] = useState("");
  const [editingEmail, setEditingEmail] = useState("");
  const [editingPhone, setEditingPhone] = useState("");
  const [editingDomains, setEditingDomains] = useState<string[]>([]);
  const [editingExperience, setEditingExperience] = useState("2-5 years");
  const [editingLocation, setEditingLocation] = useState("Remote / India");
  const [editingSkills, setEditingSkills] = useState("");
  const [editingResume, setEditingResume] = useState("");
  const [uploadedFile, setUploadedFile] = useState<CandidateResumeFile | null>(null);

  // Jobs State
  const [jobs, setJobs] = useState<JobOpening[]>([]);
  const [selectedDomainFilter, setSelectedDomainFilter] = useState("All");

  // Application Logs State
  const [applicationLogs, setApplicationLogs] = useState<JobApplicationLog[]>([]);
  const [selectedLog, setSelectedLog] = useState<JobApplicationLog | null>(null);

  // Status Notification
  const [notification, setNotification] = useState<{ message: string; type: "success" | "info" } | null>(null);

  function notify(message: string, type: "success" | "info" = "success") {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4000);
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      const fileObj: CandidateResumeFile = {
        name: file.name,
        size: file.size,
        type: file.type || "application/pdf",
        dataUrl,
        updatedAt: new Date().toISOString(),
      };
      setUploadedFile(fileObj);

      // Auto update resume text with filename and overview
      setEditingResume(
        (prev) =>
          prev ||
          `Resume PDF Attached: ${file.name}\nFile Size: ${(file.size / 1024).toFixed(1)} KB\nType: ${file.type || "application/pdf"}`
      );

      notify(`PDF Resume "${file.name}" uploaded successfully!`, "success");
    };
    reader.readAsDataURL(file);
  }

  // Load Profile and Initial Jobs
  useEffect(() => {
    fetchProfile();
    fetchFreshJobs();
    fetchLogs();
  }, []);

  async function fetchProfile() {
    try {
      setLoading(true);
      const res = await fetch("/api/job-agent/profile");
      const data = await res.json();
      if (data.profile) {
        setProfile(data.profile);
        setEditingFullName(data.profile.fullName || "");
        setEditingEmail(data.profile.email || "");
        setEditingPhone(data.profile.phone || "");
        setEditingDomains(data.profile.domains || []);
        setEditingExperience(data.profile.experienceLevel || "2-5 years");
        setEditingLocation(data.profile.location || "Remote");
        setEditingSkills((data.profile.keySkills || []).join(", "));
        setEditingResume(data.profile.resumeText || "");
        if (data.profile.resumeFile) {
          setUploadedFile(data.profile.resumeFile);
        }
      }
    } catch (err) {
      console.error("Failed to load profile:", err);
    } finally {
      setLoading(false);
    }
  }

  async function fetchFreshJobs(domain = selectedDomainFilter) {
    try {
      setExtracting(true);
      const url = domain && domain !== "All" ? `/api/job-agent/extract-jobs?domain=${encodeURIComponent(domain)}` : "/api/job-agent/extract-jobs";
      const res = await fetch(url);
      const data = await res.json();
      if (data.jobs) {
        setJobs(data.jobs);
      }
    } catch (err) {
      console.error("Failed to extract jobs:", err);
    } finally {
      setExtracting(false);
    }
  }

  async function fetchLogs() {
    try {
      const res = await fetch("/api/job-agent/apply");
      const data = await res.json();
      if (data.logs) {
        setApplicationLogs(data.logs);
      }
    } catch (err) {
      console.error("Failed to load application logs:", err);
    }
  }

  async function handleSaveProfile(e?: React.FormEvent) {
    if (e) e.preventDefault();
    try {
      setLoading(true);
      const keySkillsArray = editingSkills
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      const resumeFileName = uploadedFile?.name || profile?.resumeFileName || "Anas_Ali_Resume.pdf";
      const resumeFile = uploadedFile || profile?.resumeFile;

      const res = await fetch("/api/job-agent/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: editingFullName,
          email: editingEmail,
          phone: editingPhone,
          domains: editingDomains,
          experienceLevel: editingExperience,
          location: editingLocation,
          keySkills: keySkillsArray,
          resumeText: editingResume,
          resumeFileName,
          resumeFile,
        }),
      });

      const data = await res.json();
      if (data.profile) {
        setProfile(data.profile);
        notify("Job preferences & PDF resume uploaded & parsed successfully!");
        // Re-calculate jobs match score with updated profile
        fetchFreshJobs();
      }
    } catch (err) {
      console.error("Failed to update profile:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSingleApply(jobId: string) {
    try {
      setApplyingJobId(jobId);
      const res = await fetch("/api/job-agent/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId }),
      });
      const data = await res.json();
      if (data.log) {
        notify(`Applied successfully to ${data.log.company} - ${data.log.jobTitle}!`);
        if (data.allLogs) setApplicationLogs(data.allLogs);
      }
    } catch (err) {
      console.error("Failed to apply to job:", err);
    } finally {
      setApplyingJobId(null);
    }
  }

  async function handleBulkAutoApply() {
    try {
      setBulkApplying(true);
      const res = await fetch("/api/job-agent/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "bulk_apply",
          minScoreThreshold: profile?.minMatchScoreThreshold || 70,
        }),
      });
      const data = await res.json();
      notify(`Bulk Auto-Apply complete! Submitted ${data.appliedCount} new application(s).`);
      if (data.logs) setApplicationLogs(data.logs);
      setActiveTab("pipeline");
    } catch (err) {
      console.error("Bulk auto-apply failed:", err);
    } finally {
      setBulkApplying(false);
    }
  }

  function toggleDomain(domain: string) {
    if (editingDomains.includes(domain)) {
      setEditingDomains(editingDomains.filter((d) => d !== domain));
    } else {
      setEditingDomains([...editingDomains, domain]);
    }
  }

  return (
    <AppShell
      title="Automated Job Agent & Auto-Apply Portal"
      description="Set your job domain, experience & resume once — AI will extract fresh openings and automatically apply on your behalf."
      actions={
        <div className="flex items-center gap-3">
          <button
            onClick={handleBulkAutoApply}
            disabled={bulkApplying}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-[#00c885] to-[#00b377] text-white text-xs font-bold shadow-lg shadow-[#00c885]/20 hover:opacity-95 transition-all disabled:opacity-50 cursor-pointer"
          >
            {bulkApplying ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                <span>Auto-Applying...</span>
              </>
            ) : (
              <>
                <span>🚀 Extract & Auto-Apply All</span>
              </>
            )}
          </button>
        </div>
      }
    >
      {/* Toast Notification Banner */}
      {notification && (
        <div className="p-4 rounded-xl bg-[#00c885]/15 border border-[#00c885]/40 text-[#00c885] text-xs font-semibold flex items-center justify-between animate-fadeIn">
          <div className="flex items-center gap-2">
            <span>✨</span>
            <span>{notification.message}</span>
          </div>
          <button onClick={() => setNotification(null)} className="text-xs hover:opacity-80">
            ✕
          </button>
        </div>
      )}

      {/* Main Tabs Navigation */}
      <div className="flex items-center justify-between border-b border-[var(--border)] pb-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab("jobs")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === "jobs"
                ? "bg-[#7c75f3] text-white shadow-md shadow-[#7c75f3]/30"
                : "bg-[var(--bg-3)] text-[var(--muted)] hover:text-[var(--foreground)]"
            }`}
          >
            🔥 Fresh Openings ({jobs.length})
          </button>

          <button
            onClick={() => setActiveTab("pipeline")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === "pipeline"
                ? "bg-[#7c75f3] text-white shadow-md shadow-[#7c75f3]/30"
                : "bg-[var(--bg-3)] text-[var(--muted)] hover:text-[var(--foreground)]"
            }`}
          >
            📋 Application Log & Pipeline ({applicationLogs.length})
          </button>

          <button
            onClick={() => setActiveTab("profile")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === "profile"
                ? "bg-[#7c75f3] text-white shadow-md shadow-[#7c75f3]/30"
                : "bg-[var(--bg-3)] text-[var(--muted)] hover:text-[var(--foreground)]"
            }`}
          >
            👤 Candidate Domain & Resume
          </button>
        </div>

        {activeTab === "jobs" && (
          <button
            onClick={() => fetchFreshJobs(selectedDomainFilter)}
            disabled={extracting}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-[var(--border-2)] bg-[var(--bg-3)] hover:bg-[var(--surface-2)] text-xs font-semibold text-[var(--foreground)] transition-colors disabled:opacity-50"
          >
            <svg
              className={`w-3.5 h-3.5 text-[#7c75f3] ${extracting ? "animate-spin" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            <span>{extracting ? "Extracting..." : "Refresh Job Extraction"}</span>
          </button>
        )}
      </div>

      {/* ── TAB 1: FRESH JOB OPENINGS ── */}
      {activeTab === "jobs" && (
        <div className="space-y-6">
          {/* Domain Filter Bar */}
          <div className="flex flex-wrap items-center gap-2 bg-[var(--bg-2)] p-3 rounded-2xl border border-[var(--border)]">
            <span className="text-xs font-bold text-[var(--muted)] px-2">Filter Domain:</span>
            {["All", ...AVAILABLE_DOMAINS].map((domain) => (
              <button
                key={domain}
                onClick={() => {
                  setSelectedDomainFilter(domain);
                  fetchFreshJobs(domain);
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                  selectedDomainFilter === domain
                    ? "bg-[var(--foreground)] text-[var(--bg)] shadow-sm"
                    : "bg-[var(--bg-3)] text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--surface-2)]"
                }`}
              >
                {domain}
              </button>
            ))}
          </div>

          {/* Quick Summary Stat Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 rounded-2xl bg-[var(--bg-2)] border border-[var(--border)] flex items-center justify-between">
              <div>
                <p className="text-[11px] font-semibold text-[var(--muted)] uppercase tracking-wider">Target Domains</p>
                <p className="text-lg font-extrabold text-[var(--foreground)] mt-1">
                  {profile?.domains.join(", ") || "Frontend, Full Stack"}
                </p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-[#7c75f3]/10 text-[#7c75f3] flex items-center justify-center font-bold text-lg">
                🎯
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-[var(--bg-2)] border border-[var(--border)] flex items-center justify-between">
              <div>
                <p className="text-[11px] font-semibold text-[var(--muted)] uppercase tracking-wider">Required Experience</p>
                <p className="text-lg font-extrabold text-[#00c885] mt-1">{profile?.experienceLevel || "2-5 years"}</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-[#00c885]/10 text-[#00c885] flex items-center justify-center font-bold text-lg">
                ⏳
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-[var(--bg-2)] border border-[var(--border)] flex items-center justify-between">
              <div>
                <p className="text-[11px] font-semibold text-[var(--muted)] uppercase tracking-wider">Auto-Apply Threshold</p>
                <p className="text-lg font-extrabold text-[#7c75f3] mt-1">
                  ≥ {profile?.minMatchScoreThreshold || 75}% Match
                </p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-[#7c75f3]/10 text-[#7c75f3] flex items-center justify-center font-bold text-lg">
                ⚡
              </div>
            </div>
          </div>

          {/* Job Openings Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {jobs.map((job) => {
              const isApplied = applicationLogs.some((log) => log.jobId === job.id);
              const isApplying = applyingJobId === job.id;

              return (
                <div
                  key={job.id}
                  className="p-5 rounded-2xl bg-[var(--bg-2)] border border-[var(--border)] hover:border-[#7c75f3]/50 transition-all flex flex-col justify-between space-y-4 shadow-sm"
                >
                  <div className="space-y-2">
                    {/* Top row badges */}
                    <div className="flex items-center justify-between gap-2">
                      <span className="px-2.5 py-1 rounded-lg text-[10px] font-bold tracking-wide uppercase bg-[#7c75f3]/15 text-[#7c75f3]">
                        {job.domain}
                      </span>
                      <span className="px-2.5 py-1 rounded-lg text-[10px] font-semibold bg-[var(--bg-3)] text-[#00c885]">
                        {job.freshnessTag}
                      </span>
                    </div>

                    {/* Job Title & Company */}
                    <div>
                      <h3 className="text-base font-bold text-[var(--foreground)] tracking-tight hover:text-[#7c75f3] transition-colors">
                        {job.title}
                      </h3>
                      <p className="text-xs font-semibold text-[var(--muted)] mt-0.5">
                        🏢 {job.company} • 📍 {job.location} • 💼 {job.experienceRequired}
                      </p>
                    </div>

                    <p className="text-xs text-[var(--muted)] line-clamp-2 leading-relaxed">{job.description}</p>

                    {/* Match Score Bar */}
                    <div className="p-3 rounded-xl bg-[var(--bg-3)] border border-[var(--border-2)] space-y-1.5">
                      <div className="flex items-center justify-between text-xs font-bold">
                        <span className="text-[var(--foreground)]">Resume Match Score</span>
                        <span
                          className={
                            job.matchScore >= 80 ? "text-[#00c885]" : job.matchScore >= 60 ? "text-[#e5a93c]" : "text-[#ff4d4d]"
                          }
                        >
                          {job.matchScore}%
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-[var(--border)] rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            job.matchScore >= 80 ? "bg-[#00c885]" : job.matchScore >= 60 ? "bg-[#e5a93c]" : "bg-[#ff4d4d]"
                          }`}
                          style={{ width: `${job.matchScore}%` }}
                        />
                      </div>
                      {job.matchReasoning && job.matchReasoning.length > 0 && (
                        <p className="text-[10px] text-[var(--muted)] italic">
                          Key match: {job.matchReasoning[0]}
                        </p>
                      )}
                    </div>

                    {/* Required Skills Chips */}
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {job.requiredSkills.map((skill) => (
                        <span
                          key={skill}
                          className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-[var(--bg-3)] border border-[var(--border-2)] text-[var(--foreground)]"
                        >
                          {skill}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Card Action Controls */}
                  <div className="pt-3 border-t border-[var(--border)] flex items-center justify-between gap-3">
                    <div className="text-xs font-bold text-[var(--foreground)]">{job.salaryRange}</div>

                    <div className="flex items-center gap-2">
                      <a
                        href={job.applyUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="px-3 py-1.5 rounded-xl border border-[var(--border-2)] bg-[var(--bg-3)] hover:bg-[var(--surface-2)] text-xs font-semibold text-[var(--muted)] transition-colors"
                      >
                        Portal 🔗
                      </a>

                      {isApplied ? (
                        <span className="px-3 py-1.5 rounded-xl bg-[#00c885]/15 border border-[#00c885]/30 text-[#00c885] text-xs font-bold flex items-center gap-1">
                          ✓ Applied
                        </span>
                      ) : (
                        <button
                          onClick={() => handleSingleApply(job.id)}
                          disabled={isApplying}
                          className="px-3.5 py-1.5 rounded-xl bg-[#7c75f3] hover:bg-[#6861e6] text-white text-xs font-bold shadow-md transition-all disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
                        >
                          {isApplying ? (
                            <>
                              <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                              </svg>
                              <span>Applying...</span>
                            </>
                          ) : (
                            <span>Auto-Apply ⚡</span>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── TAB 2: APPLICATION PIPELINE & HISTORY ── */}
      {activeTab === "pipeline" && (
        <div className="space-y-6">
          <div className="p-5 rounded-2xl bg-[var(--bg-2)] border border-[var(--border)]">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-bold text-[var(--foreground)]">Automated Application Tracker</h2>
                <p className="text-xs text-[var(--muted)]">Real-time log of jobs applied on your behalf by StitchFlow agent.</p>
              </div>
              <span className="px-3 py-1 rounded-xl bg-[#00c885]/15 text-[#00c885] text-xs font-bold">
                {applicationLogs.length} Applications Active
              </span>
            </div>

            {applicationLogs.length === 0 ? (
              <div className="p-12 text-center text-[var(--muted)] space-y-2">
                <p className="text-2xl">📥</p>
                <p className="text-sm font-semibold">No applications submitted yet.</p>
                <p className="text-xs">Click &quot;Extract &amp; Auto-Apply All&quot; or apply directly from Fresh Openings tab.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-[var(--border)] text-[var(--muted)] font-semibold uppercase text-[10px]">
                      <th className="pb-3">Job &amp; Company</th>
                      <th className="pb-3">Domain</th>
                      <th className="pb-3">Match Score</th>
                      <th className="pb-3">Status</th>
                      <th className="pb-3">Applied Timestamp</th>
                      <th className="pb-3 text-right">Cover Letter</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {applicationLogs.map((log, idx) => (
                      <tr key={`${log.id}-${log.jobId}-${idx}`} className="hover:bg-[var(--bg-3)]/50 transition-colors">
                        <td className="py-3 pr-4">
                          <p className="font-bold text-[var(--foreground)]">{log.jobTitle}</p>
                          <p className="text-[11px] text-[var(--muted)]">{log.company}</p>
                        </td>
                        <td className="py-3 pr-4">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#7c75f3]/15 text-[#7c75f3]">
                            {log.domain}
                          </span>
                        </td>
                        <td className="py-3 pr-4">
                          <span className="font-bold text-[#00c885]">{log.matchScore}%</span>
                        </td>
                        <td className="py-3 pr-4">
                          <span className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-[#00c885]/15 text-[#00c885] capitalize">
                            ✓ {log.status}
                          </span>
                        </td>
                        <td className="py-3 pr-4 text-[var(--muted)]">
                          {new Date(log.appliedAt).toLocaleString()}
                        </td>
                        <td className="py-3 text-right">
                          <button
                            onClick={() => setSelectedLog(log)}
                            className="px-2.5 py-1 rounded-lg bg-[var(--bg-3)] border border-[var(--border-2)] text-[10px] font-bold text-[#7c75f3] hover:bg-[var(--surface-2)] transition-colors"
                          >
                            View Letter 📄
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Cover Letter Modal */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[var(--bg-2)] border border-[var(--border-2)] rounded-2xl max-w-2xl w-full p-6 space-y-4 shadow-2xl animate-scaleIn">
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
              <div>
                <h3 className="text-base font-bold text-[var(--foreground)]">{selectedLog.jobTitle}</h3>
                <p className="text-xs text-[var(--muted)]">{selectedLog.company} • Match Score {selectedLog.matchScore}%</p>
              </div>
              <button
                onClick={() => setSelectedLog(null)}
                className="w-8 h-8 rounded-lg bg-[var(--bg-3)] flex items-center justify-center text-xs font-bold text-[var(--muted)] hover:text-[var(--foreground)]"
              >
                ✕
              </button>
            </div>

            {selectedLog.attachedResume && (
              <div className="p-3 rounded-xl bg-[#00c885]/10 border border-[#00c885]/30 flex items-center justify-between text-xs font-semibold text-[#00c885]">
                <div className="flex items-center gap-2">
                  <span>📄 Attached Resume PDF:</span>
                  <span className="font-bold text-[var(--foreground)]">{selectedLog.attachedResume.name}</span>
                </div>
                {selectedLog.attachedResume.dataUrl && (
                  <a
                    href={selectedLog.attachedResume.dataUrl}
                    download={selectedLog.attachedResume.name}
                    className="px-2.5 py-1 rounded-lg bg-[#00c885] text-white text-[10px] font-bold shadow hover:opacity-90 transition-opacity"
                  >
                    Download PDF 📥
                  </a>
                )}
              </div>
            )}

            <div className="space-y-2">
              <p className="text-xs font-bold text-[var(--foreground)]">Generated Tailored Cover Letter:</p>
              <pre className="p-4 rounded-xl bg-[var(--bg-3)] border border-[var(--border-2)] text-xs text-[var(--foreground)] whitespace-pre-wrap font-sans leading-relaxed max-h-60 overflow-y-auto">
                {selectedLog.generatedCoverLetter}
              </pre>
            </div>

            <div className="space-y-1">
              <p className="text-[11px] font-bold text-[var(--muted)]">Audit Log Timeline:</p>
              <ul className="text-[11px] text-[var(--muted)] space-y-1 pl-4 list-disc">
                {selectedLog.auditLogs.map((log, idx) => (
                  <li key={idx}>{log}</li>
                ))}
              </ul>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setSelectedLog(null)}
                className="px-4 py-2 rounded-xl bg-[#7c75f3] text-white text-xs font-bold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 3: CANDIDATE DOMAIN & RESUME SETUP ── */}
      {activeTab === "profile" && (
        <form onSubmit={handleSaveProfile} className="space-y-6">
          <div className="p-6 rounded-2xl bg-[var(--bg-2)] border border-[var(--border)] space-y-6">
            {/* Personal Details (Name, Email, Phone) */}
            <div className="space-y-3 pb-4 border-b border-[var(--border)]">
              <h2 className="text-base font-bold text-[var(--foreground)]">👤 Personal Contact Details</h2>
              <p className="text-xs text-[var(--muted)]">These details are automatically populated when applying to job portals.</p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                <div>
                  <label className="block text-xs font-bold text-[var(--foreground)] mb-1">
                    Full Name
                  </label>
                  <input
                    type="text"
                    value={editingFullName}
                    onChange={(e) => setEditingFullName(e.target.value)}
                    placeholder="e.g. Anas Ali"
                    className="w-full p-2.5 rounded-xl bg-[var(--bg-3)] border border-[var(--border-2)] text-xs text-[var(--foreground)] focus:outline-none focus:border-[#7c75f3]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[var(--foreground)] mb-1">
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={editingEmail}
                    onChange={(e) => setEditingEmail(e.target.value)}
                    placeholder="e.g. anas@example.com"
                    className="w-full p-2.5 rounded-xl bg-[var(--bg-3)] border border-[var(--border-2)] text-xs text-[var(--foreground)] focus:outline-none focus:border-[#7c75f3]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[var(--foreground)] mb-1">
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    value={editingPhone}
                    onChange={(e) => setEditingPhone(e.target.value)}
                    placeholder="e.g. +91 98765 43210"
                    className="w-full p-2.5 rounded-xl bg-[var(--bg-3)] border border-[var(--border-2)] text-xs text-[var(--foreground)] focus:outline-none focus:border-[#7c75f3]"
                  />
                </div>
              </div>
            </div>

            <div>
              <h2 className="text-base font-bold text-[var(--foreground)]">Job Domain &amp; Target Roles</h2>
              <p className="text-xs text-[var(--muted)]">Select your target domains. The agent will extract fresh jobs matching these domains.</p>
              
              <div className="flex flex-wrap gap-2 mt-3">
                {AVAILABLE_DOMAINS.map((domain) => {
                  const isSelected = editingDomains.includes(domain);
                  return (
                    <button
                      type="button"
                      key={domain}
                      onClick={() => toggleDomain(domain)}
                      className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition-all ${
                        isSelected
                          ? "bg-[#7c75f3] border-[#7c75f3] text-white shadow-md shadow-[#7c75f3]/25"
                          : "bg-[var(--bg-3)] border-[var(--border-2)] text-[var(--muted)] hover:text-[var(--foreground)]"
                      }`}
                    >
                      {isSelected ? "✓ " : "+ "}
                      {domain}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Experience Level & Preferred Location */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-[var(--border)]">
              <div>
                <label className="block text-xs font-bold text-[var(--foreground)] mb-1">
                  Experience Level
                </label>
                <select
                  value={editingExperience}
                  onChange={(e) => setEditingExperience(e.target.value)}
                  className="w-full p-2.5 rounded-xl bg-[var(--bg-3)] border border-[var(--border-2)] text-xs text-[var(--foreground)] focus:outline-none focus:border-[#7c75f3]"
                >
                  {EXPERIENCE_LEVELS.map((exp) => (
                    <option key={exp.value} value={exp.value}>
                      {exp.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-[var(--foreground)] mb-1">
                  Preferred Location &amp; Job Types
                </label>
                <input
                  type="text"
                  value={editingLocation}
                  onChange={(e) => setEditingLocation(e.target.value)}
                  placeholder="e.g. Remote, India, Full-time"
                  className="w-full p-2.5 rounded-xl bg-[var(--bg-3)] border border-[var(--border-2)] text-xs text-[var(--foreground)] focus:outline-none focus:border-[#7c75f3]"
                />
              </div>
            </div>

            {/* Key Skills */}
            <div className="pt-4 border-t border-[var(--border)]">
              <label className="block text-xs font-bold text-[var(--foreground)] mb-1">
                Core Key Skills (comma-separated)
              </label>
              <input
                type="text"
                value={editingSkills}
                onChange={(e) => setEditingSkills(e.target.value)}
                placeholder="React, Next.js, TypeScript, Node.js, GraphQL, Tailwind CSS"
                className="w-full p-2.5 rounded-xl bg-[var(--bg-3)] border border-[var(--border-2)] text-xs text-[var(--foreground)] focus:outline-none focus:border-[#7c75f3]"
              />
            </div>

            {/* Resume PDF Upload & Text Area */}
            <div className="pt-4 border-t border-[var(--border)] space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <label className="block text-xs font-bold text-[var(--foreground)]">
                    📄 Candidate PDF Resume Upload
                  </label>
                  <p className="text-[11px] text-[var(--muted)]">
                    Upload your PDF resume once. The automated agent will attach this exact PDF file to all job applications.
                  </p>
                </div>
                {(uploadedFile || profile?.resumeFileName) && (
                  <span className="px-3 py-1.5 rounded-xl text-xs font-bold bg-[#00c885]/15 border border-[#00c885]/40 text-[#00c885] flex items-center gap-1.5 shadow-sm">
                    <span>📄</span>
                    <span>{uploadedFile?.name || profile?.resumeFileName}</span>
                    {uploadedFile?.size && <span className="text-[10px] opacity-80">({(uploadedFile.size / 1024).toFixed(1)} KB)</span>}
                    <span className="text-[10px] bg-[#00c885] text-white px-1.5 py-0.5 rounded font-extrabold">READY</span>
                  </span>
                )}
              </div>

              {/* Upload Dropzone */}
              <div className="p-5 rounded-2xl bg-[var(--bg-3)] border-2 border-dashed border-[#7c75f3]/40 hover:border-[#7c75f3] transition-all text-center space-y-2 relative">
                <input
                  type="file"
                  accept=".pdf,.doc,.docx"
                  onChange={handleFileUpload}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                />
                <div className="w-10 h-10 rounded-xl bg-[#7c75f3]/15 text-[#7c75f3] flex items-center justify-center mx-auto text-xl font-bold">
                  📤
                </div>
                <div>
                  <p className="text-xs font-bold text-[var(--foreground)]">
                    Click or Drag &amp; Drop your <span className="text-[#7c75f3]">PDF Resume</span> file here
                  </p>
                  <p className="text-[10px] text-[var(--muted)] mt-0.5">Supports PDF, DOC, DOCX files up to 10MB</p>
                </div>
                {uploadedFile?.dataUrl && (
                  <div className="pt-1">
                    <a
                      href={uploadedFile.dataUrl}
                      download={uploadedFile.name}
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-[#7c75f3] hover:underline relative z-20"
                    >
                      📥 Download Attached PDF Preview ({uploadedFile.name})
                    </a>
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-bold text-[var(--foreground)]">
                  Resume Plain Text Extract (Optional / Fallback)
                </label>
                <textarea
                  rows={4}
                  value={editingResume}
                  onChange={(e) => setEditingResume(e.target.value)}
                  placeholder="Paste full text of your resume here..."
                  className="w-full p-3 rounded-xl bg-[var(--bg-3)] border border-[var(--border-2)] text-xs text-[var(--foreground)] focus:outline-none focus:border-[#7c75f3] font-mono leading-relaxed"
                />
              </div>
            </div>

            {/* Parsed Summary Card */}
            {profile?.parsedSummary && (
              <div className="p-4 rounded-xl bg-[var(--bg-3)] border border-[#00c885]/30 space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-[#00c885]">
                  <span>⚡ AI Resume Extracted Highlights</span>
                </div>
                <p className="text-xs text-[var(--foreground)] font-semibold">{profile.parsedSummary.overview}</p>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {profile.parsedSummary.topSkills.map((skill) => (
                    <span key={skill} className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#00c885]/15 text-[#00c885]">
                      {skill}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Save Button */}
            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={loading}
                className="px-5 py-2.5 rounded-xl bg-[#7c75f3] hover:bg-[#6861e6] text-white text-xs font-bold shadow-md shadow-[#7c75f3]/25 transition-all disabled:opacity-50 cursor-pointer"
              >
                {loading ? "Saving Profile..." : "Save Preferences & Resume"}
              </button>
            </div>
          </div>
        </form>
      )}
    </AppShell>
  );
}
