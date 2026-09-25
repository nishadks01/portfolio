"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  CalendarDays,
  ExternalLink,
  Maximize2,
  Minimize2,
} from "lucide-react";
import type { Tool, ToolFeature } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";
import { setSessionUser } from "@/lib/store/auth-slice";
import { useAppDispatch, useAppSelector } from "@/lib/store/provider";
import { AdminProfileMenu } from "./admin-profile-menu";

export function ToolsShowcase({
  tools,
  features,
  avatarUrl,
}: {
  tools: Tool[];
  features: ToolFeature[];
  avatarUrl?: string | null;
}) {
  const [expandedToolId, setExpandedToolId] = useState<string | null>(null);
  const dispatch = useAppDispatch();
  const user = useAppSelector((state) => state.auth.user);

  async function signOut() {
    await createClient().auth.signOut();
    dispatch(setSessionUser(null));
  }

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setExpandedToolId(null);
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, []);

  useEffect(() => {
    document.body.style.overflow = expandedToolId ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [expandedToolId]);

  return (
    <main className="page-shell tools-page">
      <div className="noise" />
      <div className="orb orb-one" />
      <div className="orb orb-two" />
      <div className="container">
        <nav className="nav">
          <Link className="brand" href="/">
            N<span>.</span>
          </Link>
          <div className="nav-links">
            <Link href="/">Portfolio</Link>
            <a href="#tools">Features</a>
            {user && (
              <div className="nav-account">
                <Link className="nav-admin-link" href="/admin">
                  Admin portal
                </Link>

                <AdminProfileMenu
                  avatarUrl={avatarUrl}
                  onSignOut={signOut}
                />
              </div>
            )}
          </div>
          <Link className="pill" href="/">
            Back home
          </Link>
        </nav>
        <header className="tools-hero">
          <div className="eyebrow">
            <span className="eyebrow-dot" /> Technology field notes
          </div>
          <h1>
            Tools I <span className="gradient-text">build with.</span>
          </h1>
          <p className="hero-copy">
            A living collection of the frameworks, platforms, and tools behind
            my recent work. Each block captures the features worth keeping in
            mind.
          </p>
        </header>
        <section id="tools" className="tools-grid">
          {tools.map((tool) => {
            const toolFeatures = features.filter(
              (feature) => feature.tool_id === tool.id,
            );
            const toolId = tool.id ?? tool.slug;
            const isExpanded = expandedToolId === toolId;
            return (
              <article
                className={`glass-card tool-block${isExpanded ? " expanded" : ""}`}
                key={toolId}
              >
                <div className="tool-header">
                  <div className="tool-icon">{tool.icon}</div>
                  <div>
                    <h2>{tool.name}</h2>
                    <p className="muted">{tool.description}</p>
                  </div>
                  <div className="tool-actions">
                    {tool.website_url && (
                      <a
                        className="tool-link"
                        href={tool.website_url}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`Visit ${tool.name} website`}
                      >
                        <ExternalLink size={17} />
                      </a>
                    )}
                    <button
                      className="tool-resize"
                      type="button"
                      onClick={() =>
                        setExpandedToolId(isExpanded ? null : toolId)
                      }
                      aria-label={
                        isExpanded
                          ? `Collapse ${tool.name}`
                          : `Expand ${tool.name}`
                      }
                      title={isExpanded ? "Collapse" : "Expand full screen"}
                    >
                      {isExpanded ? (
                        <Minimize2 size={17} />
                      ) : (
                        <Maximize2 size={17} />
                      )}
                    </button>
                  </div>
                </div>
                <div className="feature-list">
                  {toolFeatures.length === 0 && (
                    <p className="muted">Feature notes coming soon.</p>
                  )}
                  {toolFeatures.map((feature) => (
                    <div
                      className="feature-item"
                      key={feature.id ?? feature.title}
                    >
                      <div className="feature-meta">
                        {feature.version && <span>{feature.version}</span>}
                        {feature.release_date && (
                          <span>
                            <CalendarDays size={13} />
                            {new Date(
                              `${feature.release_date}T00:00:00`,
                            ).toLocaleDateString(undefined, {
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                            })}
                          </span>
                        )}
                      </div>
                      <h3>{feature.title}</h3>
                      <p className="muted">{feature.summary}</p>
                      {feature.details && (
                        <p className="feature-details">{feature.details}</p>
                      )}
                      {feature.source_url && (
                        <a
                          className="feature-source"
                          href={feature.source_url}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={`More details about ${feature.title}`}
                        >
                          More details <ArrowUpRight size={14} />
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </article>
            );
          })}
        </section>
        {tools.length === 0 && (
          <div className="glass-card card">
            <p className="muted">No active tools have been published yet.</p>
          </div>
        )}
        <footer className="footer">
          <Link href="/">
            <ArrowLeft size={14} style={{ verticalAlign: "middle" }} /> Back to
            portfolio
          </Link>
          <span>Updated through the admin workspace</span>
        </footer>
      </div>
    </main>
  );
}
