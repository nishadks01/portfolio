"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowUpRight,
  Check,
  Mail,
  Phone,
  MapPin,
  ExternalLink,
  Send,
  UserCog,
} from "lucide-react";
import type { PortfolioData } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";
import { setSessionUser } from "@/lib/store/auth-slice";
import { useAppDispatch, useAppSelector } from "@/lib/store/provider";
import { AdminProfileMenu } from "./admin-profile-menu";

const reveal = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.65 } },
};

export function PortfolioShell({ data }: { data: PortfolioData }) {
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [heroSlide, setHeroSlide] = useState(0);
  const dispatch = useAppDispatch();
  const user = useAppSelector((state) => state.auth.user);
  const { profile } = data;
  const featuredProject =
    data.projects.find((project) => project.featured) ?? data.projects[0];
  const heroSlides = [
    {
      eyebrow: "Currently building",
      title: profile.role,
      subtitle: profile.location,
      copy: profile.headline,
      metric: "6+",
      metricLabel: "years shipping",
      secondary: "∞",
      secondaryLabel: "ideas in motion",
    },
    {
      eyebrow: "Featured case study",
      title: featuredProject?.name ?? "Selected work",
      subtitle: featuredProject?.role ?? "Product engineering",
      copy: featuredProject?.description ?? profile.bio,
      metric: `${data.projects.length}`,
      metricLabel: "projects shaped",
      secondary: `${data.skills.length}`,
      secondaryLabel: "skills in toolkit",
    },
    {
      eyebrow: "Open to conversations",
      title: profile.available_for_work
        ? "Available for work"
        : "Building with focus",
      subtitle: profile.email,
      copy: profile.available_for_work
        ? "Open to thoughtful product work, senior engineering roles, and ambitious teams."
        : "Currently focused on building useful digital products.",
      metric: "∞",
      metricLabel: "possibilities",
      secondary: "NKS",
      secondaryLabel: "your next partner",
    },
  ];

  useEffect(() => {
    const timer = window.setInterval(
      () => setHeroSlide((current) => (current + 1) % heroSlides.length),
      5500,
    );
    return () => window.clearInterval(timer);
  }, [heroSlides.length]);
  async function signOut() {
    await createClient().auth.signOut();
    dispatch(setSessionUser(null));
  }

 async function submit(e: FormEvent<HTMLFormElement>) {
  e.preventDefault();

  const formElement = e.currentTarget;

  setSending(true);
  setError('');

  const form = new FormData(formElement);

  const res = await fetch('/api/contact', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(Object.fromEntries(form)),
  });

  setSending(false);

 
if (!res.ok) {
  const result = await res.json().catch(() => ({}));

  setError(
    result.error || 'Something went wrong. Please email me directly.'
  );

  return;
}

  setSent(true);
  formElement.reset();
  }
  const skillGroups = Array.from(new Set(data.skills.map((s) => s.group_name)));
  return (
    <main className="page-shell">
      <div className="noise" />
      <div className="orb orb-one" />
      <div className="orb orb-two" />
      <div className="container">
        <nav className="nav">
          <a className="brand" href="#top">
            N<span>.</span>
          </a>
          <div className="nav-links">
            <a href="#work">Work</a>
            <a href="#experience">Experience</a>
            <a href="#about">About</a>
            <Link href="/tools">Features</Link>
            <a href="#contact">Contact</a>
          </div>
          {user ? (
            <div className="nav-account">
              <Link className="nav-admin-link" href="/admin">
                Admin portal
              </Link>

              <AdminProfileMenu
                avatarUrl={profile.avatar_url}
                onSignOut={signOut}
              />
            </div>
          ) : <Link
            href="/admin/login"
            className="admin-icon"
            aria-label="Admin portal"
            title="Admin portal"
          >
            <UserCog size={24} />
          </Link>}
        </nav>
        <motion.section
          id="top"
          className="hero"
          initial="hidden"
          animate="show"
          variants={reveal}
        >
          <div>
            <div className="eyebrow">
              <span className="eyebrow-dot" /> Available for select
              opportunities
            </div>
            <h1>
              Building digital products that{" "}
              <span className="gradient-text">feel inevitable.</span>
            </h1>
            <p className="hero-copy">
              {profile.headline} {profile.bio}
            </p>
            <div className="hero-actions">
              <a className="btn btn-primary" href="#contact">
                Let&apos;s talk <ArrowUpRight size={16} />
              </a>
              <a className="btn" href="#work">
                Explore work
              </a>
            </div>
          </div>
          <motion.div
            className="hero-card"
            animate={{ y: [0, -8, 0] }}
            transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
          >
            <div className="hero-card-inner">
              <div className="hero-slider-top">
                <div className="hero-slide-count">
                  0{heroSlide + 1} / 0{heroSlides.length}
                </div>
                <div className="hero-slider-controls">
                  <button
                    type="button"
                    onClick={() =>
                      setHeroSlide(
                        (current) =>
                          (current - 1 + heroSlides.length) % heroSlides.length,
                      )
                    }
                    aria-label="Previous hero slide"
                  >
                    ‹
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setHeroSlide(
                        (current) => (current + 1) % heroSlides.length,
                      )
                    }
                    aria-label="Next hero slide"
                  >
                    ›
                  </button>
                </div>
              </div>
              <div className="hero-slider-viewport">
                <AnimatePresence mode="wait">
                  <motion.div
                    className="hero-slide"
                    key={heroSlide}
                    initial={{ opacity: 0, x: 24 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -24 }}
                    transition={{ duration: 0.35 }}
                  >
                    <div className="avatar">NKS</div>
                    <p className="mini-label">
                      {heroSlides[heroSlide].eyebrow}
                    </p>
                    <h3>{heroSlides[heroSlide].title}</h3>
                    <p className="hero-slide-subtitle">
                      {heroSlides[heroSlide].subtitle}
                    </p>
                    <p className="hero-slide-copy">
                      {heroSlides[heroSlide].copy}
                    </p>
                    <div className="hero-stat">
                      <div>
                        <strong>{heroSlides[heroSlide].metric}</strong>
                        <div className="mini-label">
                          {heroSlides[heroSlide].metricLabel}
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <strong>{heroSlides[heroSlide].secondary}</strong>
                        <div className="mini-label">
                          {heroSlides[heroSlide].secondaryLabel}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                </AnimatePresence>
              </div>
              <div className="hero-slider-dots" aria-label="Hero slides">
                {heroSlides.map((_, index) => (
                  <button
                    key={index}
                    type="button"
                    className={heroSlide === index ? "active" : ""}
                    onClick={() => setHeroSlide(index)}
                    aria-label={`Show hero slide ${index + 1}`}
                  />
                ))}
              </div>
            </div>
          </motion.div>
        </motion.section>

        <motion.section
          id="work"
          className="section"
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-80px" }}
          variants={reveal}
        >
          <div className="section-heading">
            <h2>Selected work</h2>
            <p>
              A few places where product thinking, visual systems, and
              engineering meet.
            </p>
          </div>
          <div className="grid grid-2">
            {data.projects
              .filter(
                (p) =>
                  p.featured ||
                  data.projectVideos.some((video) => video.project_id === p.id),
              )
              .map((project, i) => (
                <article
                  className="glass-card card project-card"
                  key={project.id ?? project.name}
                >
                  <div className="project-number">0{i + 1} / CASE STUDY</div>
                  <h3>{project.name}</h3>
                  <p className="muted">{project.description}</p>
                  {data.projectVideos
                    .filter((video) => video.project_id === project.id)
                    .map((video) => (
                      <div
                        className="project-video"
                        key={video.id ?? video.public_url}
                      >
                        <video
                          controls
                          preload="metadata"
                          src={video.public_url}
                        />
                        <div className="project-video-caption">
                          <strong>{video.title}</strong>
                          {video.description && (
                            <span>{video.description}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  <div className="chips">
                    {project.technologies.slice(0, 6).map((t) => (
                      <span className="chip" key={t}>
                        {t}
                      </span>
                    ))}
                  </div>
                  {project.url && (
                    <a
                      className="btn"
                      style={{ marginTop: 18, width: "fit-content" }}
                      href={project.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      View project <ArrowUpRight size={15} />
                    </a>
                  )}
                </article>
              ))}
          </div>
        </motion.section>

        <section id="about" className="section">
          <div className="section-heading">
            <h2>The toolkit</h2>
            <p>
              From thoughtful component systems to resilient APIs, these are the
              tools I reach for.
            </p>
          </div>
          <div className="grid grid-3">
            {skillGroups.map((group) => (
              <div className="glass-card card" key={group}>
                <h3>{group}</h3>
                <div className="chips">
                  {data.skills
                    .filter((s) => s.group_name === group)
                    .map((skill) => (
                      <span className="chip" key={skill.id ?? skill.name}>
                        {skill.name}
                      </span>
                    ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section id="experience" className="section">
          <div className="section-heading">
            <h2>Experience</h2>
            <p>
              Leading teams, shaping architecture, and turning complex
              requirements into calm interfaces.
            </p>
          </div>
          <div className="glass-card card timeline">
            {data.experiences.map((exp) => (
              <div className="timeline-item" key={exp.id ?? exp.company}>
                <div className="timeline-meta">
                  {exp.start_date} — {exp.end_date ?? "Present"} ·{" "}
                  {exp.location}
                </div>
                <h3>{exp.title}</h3>
                <div className="timeline-company">{exp.company}</div>
                <ul className="list">
                  {exp.bullets.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <section className="section">
          <div className="section-heading">
            <h2>Education</h2>
            <p>
              A foundation in computer science, with a bias toward learning by
              building.
            </p>
          </div>
          <div className="grid grid-2">
            {data.education.map((item) => (
              <div className="glass-card card" key={item.id ?? item.degree}>
                <div className="eyebrow">{item.year}</div>
                <h3 style={{ marginTop: 12 }}>{item.degree}</h3>
                <p className="muted">{item.institution}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="contact" className="section">
          <div className="contact">
            <div className="glass-card contact-copy">
              <div className="eyebrow">Have a project in mind?</div>
              <h2>Let&apos;s make something useful.</h2>
              <p className="muted">
                I&apos;m open to thoughtful product work, senior engineering
                roles, and conversations about building better digital
                experiences.
              </p>
              <div className="contact-details">
                <a className="contact-detail" href={`mailto:${profile.email}`}>
                  <Mail size={17} />
                  {profile.email}
                </a>
                <a className="contact-detail" href={`tel:${profile.phone}`}>
                  <Phone size={17} />
                  {profile.phone}
                </a>
                <span className="contact-detail">
                  <MapPin size={17} />
                  {profile.location}
                </span>
                <a
                  className="contact-detail"
                  href={profile.linkedin_url ?? "#"}
                  target="_blank"
                  rel="noreferrer"
                >
                  <ExternalLink size={17} />
                  LinkedIn
                </a>
                {profile.github_url && (
                  <a
                    className="contact-detail"
                    href={profile.github_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <ExternalLink size={17} />
                    GitHub
                  </a>
                )}
              </div>
            </div>
            <form className="glass-card form" onSubmit={submit}>
              <div className="field">
                <label htmlFor="name">Name</label>
                <input id="name" name="name" required placeholder="Your name" />
              </div>
              <div className="field">
                <label htmlFor="email">Email</label>
                <input
                  id="email"
                  type="email"
                  name="email"
                  required
                  placeholder="you@company.com"
                />
              </div>
              <div className="field">
                <label htmlFor="message">Message</label>
                <textarea
                  id="message"
                  name="message"
                  required
                  placeholder="Tell me a little about what you are building..."
                />
              </div>
              {sent && (
                <div className="form-status">
                  <Check size={15} style={{ verticalAlign: "middle" }} />{" "}
                  Message sent. I&apos;ll be in touch.
                </div>
              )}
              {error && <div className="error">{error}</div>}
              <button
                className="btn btn-primary"
                type="submit"
                disabled={sending}
              >
                {sending ? "Sending…" : "Send message"} <Send size={15} />
              </button>
            </form>
          </div>
        </section>
        <footer className="footer">
          <span>
            © {new Date().getFullYear()} {profile.full_name}
          </span>
          <span>{profile.role} · Crafted with Next.js</span>
          <a href="#top">Back to top ↑</a>
        </footer>
      </div>
    </main>
  );
}
