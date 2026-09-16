/**
 * ComparisonModal — the demo payoff, in two parts:
 *   1. Scoreboard (fail → win): the buyer questions an answer engine could/couldn't
 *      answer from the un-optimized snippet vs the agent's optimized layer.
 *   2. Artifact: what the agent generated from the bare entry (answer-first copy,
 *      meta, key facts, FAQ, schema.org JSON-LD).
 * Rendered via venus `cbModal` (injects `closeModal`).
 */
import React from "react";
import { ModalHeader, ModalBody, ModalFooter, Button } from "@contentstack/venus-components";
import "@contentstack/venus-components/build/main.css";
import "./SidebarWidgetSeoPrompts.css";
import Markdown from "./Markdown";
import type { GeoPackage } from "./agent";

export interface QuestionResult {
  q: string;
  beforeAnswer: string;
  afterAnswer: string;
  beforeAnswered: boolean;
  afterAnswered: boolean;
}

interface ComparisonModalProps {
  closeModal?: () => void;
  title: string;
  snippet: string;
  results: QuestionResult[];
  pkg: GeoPackage;
}

const Answered: React.FC<{ ok: boolean }> = ({ ok }) => (
  <span className={`seo-cmp-mark ${ok ? "seo-cmp-mark--yes" : "seo-cmp-mark--no"}`}>
    {ok ? "✓ Answered" : "✗ Not stated"}
  </span>
);

const ComparisonModal: React.FC<ComparisonModalProps> = ({
  closeModal,
  title,
  snippet,
  results,
  pkg,
}) => {
  const total = results.length;
  const beforeCount = results.filter((r) => r.beforeAnswered).length;
  const afterCount = results.filter((r) => r.afterAnswered).length;

  return (
    <div className="seo-cmp">
      <ModalHeader title={`Answer-engine readiness — ${title}`} closeModal={closeModal} />
      <ModalBody>
        <p className="seo-cmp-intro">
          How an AI answer engine would handle real questions about this entry once it’s published —
          using the un-optimized page vs the layer the agent generated.
        </p>

        {/* —— Scoreboard —— */}
        <div className="seo-cmp-scoreboard">
          <div className="seo-cmp-stat seo-cmp-stat--before">
            <span className="seo-cmp-stat-num">
              {beforeCount}/{total}
            </span>
            <span className="seo-cmp-stat-label">Before · answered</span>
          </div>
          <span className="seo-cmp-arrow">→</span>
          <div className="seo-cmp-stat seo-cmp-stat--after">
            <span className="seo-cmp-stat-num">
              {afterCount}/{total}
            </span>
            <span className="seo-cmp-stat-label">After · answered</span>
          </div>
        </div>

        <div className="seo-cmp-questions">
          {results.map((r, i) => (
            <div key={i} className="seo-cmp-q">
              <p className="seo-cmp-q-text">{r.q}</p>
              <div className="seo-cmp-grid">
                <section className="seo-cmp-col">
                  <div className="seo-cmp-col-head">
                    <span className="seo-cmp-badge seo-cmp-badge--before">Before</span>
                    <Answered ok={r.beforeAnswered} />
                  </div>
                  <div className="seo-cmp-answer">
                    <Markdown text={r.beforeAnswer} />
                  </div>
                </section>
                <section className="seo-cmp-col">
                  <div className="seo-cmp-col-head">
                    <span className="seo-cmp-badge seo-cmp-badge--after">After</span>
                    <Answered ok={r.afterAnswered} />
                  </div>
                  <div className="seo-cmp-answer">
                    <Markdown text={r.afterAnswer} />
                  </div>
                </section>
              </div>
            </div>
          ))}
        </div>

        {/* —— Generated artifact —— */}
        <h4 className="seo-cmp-section-title">What the agent generated</h4>
        <p className="seo-cmp-section-sub">
          Produced automatically from the entry’s existing content — nothing written by hand.
        </p>

        <div className="seo-art">
          <div className="seo-art-block">
            <span className="seo-art-label">Answer-first summary</span>
            <p className="seo-art-text">{pkg.answerFirst}</p>
          </div>

          <div className="seo-art-meta">
            <div className="seo-art-block">
              <span className="seo-art-label">
                Meta title <span className="seo-art-count">{pkg.metaTitle.length}/60</span>
              </span>
              <p className="seo-art-text">{pkg.metaTitle}</p>
            </div>
            <div className="seo-art-block">
              <span className="seo-art-label">
                Meta description <span className="seo-art-count">{pkg.metaDescription.length}/155</span>
              </span>
              <p className="seo-art-text">{pkg.metaDescription}</p>
            </div>
          </div>

          {pkg.keyFacts.length > 0 && (
            <div className="seo-art-block">
              <span className="seo-art-label">Key facts</span>
              <ul className="seo-art-facts">
                {pkg.keyFacts.map((f, i) => (
                  <li key={i}>{f}</li>
                ))}
              </ul>
            </div>
          )}

          {pkg.faq.length > 0 && (
            <div className="seo-art-block">
              <span className="seo-art-label">FAQ</span>
              <dl className="seo-art-faq">
                {pkg.faq.map((f, i) => (
                  <React.Fragment key={i}>
                    <dt>{f.q}</dt>
                    <dd>{f.a}</dd>
                  </React.Fragment>
                ))}
              </dl>
            </div>
          )}

          <details className="seo-cmp-prompt">
            <summary>schema.org JSON-LD</summary>
            <pre className="seo-cmp-prompt-pre">{pkg.jsonLd}</pre>
          </details>

          <details className="seo-cmp-prompt">
            <summary>Un-optimized snippet (the “Before” source)</summary>
            <pre className="seo-cmp-prompt-pre">{snippet}</pre>
          </details>
        </div>
      </ModalBody>
      <ModalFooter>
        <Button buttonType="light" onClick={closeModal}>
          Close
        </Button>
      </ModalFooter>
    </div>
  );
};

export default ComparisonModal;
