import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { Accessibility, Boxes, Cloud, Cpu, Database, Eye, Gauge, Lock, Rocket, Server, ShieldCheck, Waves, Zap } from 'lucide-react';
import { Panel, PlayNowButton, SectionHeading, Seo } from '@/components/common/atoms';
import { ENGINE_VERSION } from '@shared/game/config';
import { useConfig } from '@/hooks/useApi';

const FAQ = [
  {
    question: 'How can you prove a score was not edited?',
    answer:
      'The game is a deterministic simulation: given the same seed and the same sequence of inputs, it always produces the same result. The browser records your inputs per tick and sends them. A Cloudflare Worker loads the identical engine module and re-runs the whole mission. The score it computes is what gets stored — the number you saw on screen is only ever a preview of it.',
  },
  {
    question: 'What happens if verification fails?',
    answer:
      'The run is written to the rejected-runs table with the exact engine reason (score mismatch, wave mismatch, tick mismatch, engine version drift) and it is never ranked, never grants XP and never unlocks achievements. Nothing is silently discarded: you are told the reason on the results screen, and moderators can audit every rejection in the admin console.',
  },
  {
    question: 'Do I need an account?',
    answer:
      'No. A guest identity is minted on your first visit so you can play, appear on boards and unlock achievements immediately. Securing the record with an email later keeps the same player row, so nothing is migrated or lost.',
  },
  {
    question: 'How does assist mode work?',
    answer:
      'Assist gives an extra life, reduces enemy fire and doubles power-up drops. Assisted runs are still verified and still count toward your XP and achievements — they are simply excluded from the ranked boards, and the run is stored with ranked = false so the distinction is permanent and visible.',
  },
  {
    question: 'What is stored about me?',
    answer:
      'Only what the game needs: your handle, display name, XP, aggregate counters, verified runs, achievement unlocks and preferences. You can export everything as JSON or delete the account and all attached data from Settings at any time.',
  },
  {
    question: 'Can I play offline?',
    answer:
      'The engine runs entirely in your browser, so gameplay never depends on the network. The API being unreachable means runs cannot be verified and boards cannot refresh; the client keeps the result in the tab and lets you resubmit it as soon as the worker answers again.',
  },
];

const STACK = [
  { icon: <Server className="h-4 w-4" />, label: 'Vercel', detail: 'Static frontend delivery with immutable asset caching and instant rollbacks.' },
  { icon: <Cloud className="h-4 w-4" />, label: 'Cloudflare Workers', detail: 'API, replay verification, WebSocket hubs and cron maintenance on the edge.' },
  { icon: <Database className="h-4 w-4" />, label: 'D1 + R2 + KV', detail: 'SQLite for records, object storage for replays, KV for hot caches and rate limits.' },
  { icon: <Waves className="h-4 w-4" />, label: 'Queues', detail: 'Asynchronous archiving and post-processing so submissions stay fast.' },
  { icon: <Boxes className="h-4 w-4" />, label: 'Durable Objects', detail: 'One hibernating WebSocket hub per leaderboard for live score feeds.' },
  { icon: <Cpu className="h-4 w-4" />, label: 'Shared engine', detail: 'A single TypeScript module graph used by both the browser and the verifier.' },
];

export default function About() {
  const config = useConfig();

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQ.map((entry) => ({
      '@type': 'Question',
      name: entry.question,
      acceptedAnswer: { '@type': 'Answer', text: entry.answer },
    })),
  };

  return (
    <>
      <Seo
        title="How verification works — architecture & FAQ | Cosmic Invader Frontiers"
        description="How a deterministic engine plus server-side replay verification makes arcade leaderboards trustworthy. Architecture, fair-play rules, privacy and accessibility."
        path="/about"
        jsonLd={jsonLd}
      />

      <div className="mx-auto w-full max-w-5xl px-4 py-12 sm:px-6">
        <header>
          <p className="label-eyebrow">Engineering notes</p>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight sm:text-5xl">
            A leaderboard you can <span className="text-gradient">audit</span>.
          </h1>
          <p className="mt-4 max-w-3xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            Cosmic Invader Frontiers is built around one idea: the client should never be the authority on a score. The engine
            that renders your mission is the same code that the server uses to check it — same version, same seed, same tick
            ordering.
          </p>
        </header>

        <section className="mt-10 grid gap-4 md:grid-cols-3">
          {[
            { icon: <ShieldCheck className="h-5 w-5" />, title: 'Deterministic core', body: `Engine ${ENGINE_VERSION} uses a seeded PRNG, integer tick timing and no wall-clock reads. Replays are pure input streams.` },
            { icon: <Lock className="h-5 w-5" />, title: 'Server-side authority', body: 'Rejected submissions never touch the leaderboards, XP ledger or achievement table. Reasons are stored, not swallowed.' },
            { icon: <Zap className="h-5 w-5" />, title: 'Edge speed', body: 'Verification runs inside the same Worker request that accepts the run — no queue latency on the happy path.' },
          ].map((item) => (
            <motion.div
              key={item.title}
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.45 }}
              className="glass rounded-3xl p-5"
            >
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-primary/30 bg-primary/10 text-primary">
                {item.icon}
              </span>
              <h2 className="mt-3 font-display text-base font-semibold">{item.title}</h2>
              <p className="mt-1.5 text-sm text-muted-foreground">{item.body}</p>
            </motion.div>
          ))}
        </section>

        <section id="systems" className="mt-14 scroll-mt-24">
          <SectionHeading
            eyebrow="Architecture"
            title="What actually runs, and where"
            description="Only services that earn their place: no message broker for the sake of it, no second database for symmetry."
          />
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {STACK.map((item) => (
              <div key={item.label} className="glass flex items-start gap-3 rounded-2xl p-4">
                <span className="mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-primary">
                  {item.icon}
                </span>
                <div>
                  <p className="text-sm font-medium">{item.label}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{item.detail}</p>
                </div>
              </div>
            ))}
          </div>

          <Panel className="mt-4 p-5">
            <p className="label-eyebrow">Live configuration</p>
            <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
              {[
                ['Engine', ENGINE_VERSION],
                ['API version', config.data?.apiVersion ?? '—'],
                ['Environment', config.data?.environment ?? '—'],
                ['Ingest', config.data?.ingestEnabled === false ? 'paused' : 'live'],
                ['Arena', config.data ? `${config.data.arena.width}×${config.data.arena.height}` : '480×720'],
                ['Tick rate', '60 Hz'],
                ['Max run ticks', config.data ? config.data.maxRunTicks.toLocaleString() : '—'],
                ['Achievements', String(config.data?.achievements.total ?? 30)],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2">
                  <dt className="font-mono text-[0.58rem] uppercase tracking-widest text-muted-foreground">{label}</dt>
                  <dd className="mt-0.5 font-mono text-sm">{value}</dd>
                </div>
              ))}
            </dl>
          </Panel>
        </section>

        <section className="mt-14">
          <SectionHeading eyebrow="Fair play" title="What is and is not ranked" />
          <div className="mt-6 overflow-hidden rounded-3xl border border-white/8">
            <table className="w-full text-left text-sm">
              <thead className="bg-white/[0.04] font-mono text-[0.6rem] uppercase tracking-widest text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Run type</th>
                  <th className="px-4 py-3">Verified</th>
                  <th className="px-4 py-3">Ranked</th>
                  <th className="px-4 py-3">XP & medals</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/6">
                {[
                  ['Campaign / Gauntlet / Daily, no assist', 'Yes', 'Yes', 'Full'],
                  ['Any mode with pilot assist', 'Yes', 'No', 'Reduced (×0.6)'],
                  ['Abandoned mid-run', 'Not submitted', 'No', 'None'],
                  ['Replay that fails verification', 'Rejected + logged', 'Never', 'None'],
                ].map((row) => (
                  <tr key={row[0]}>
                    {row.map((cell, index) => (
                      <td key={cell + index} className={index === 0 ? 'px-4 py-3' : 'px-4 py-3 font-mono text-xs text-muted-foreground'}>
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section id="faq" className="mt-14 scroll-mt-24">
          <SectionHeading eyebrow="FAQ" title="Questions pilots actually ask" />
          <div className="mt-6 space-y-3">
            {FAQ.map((entry, index) => (
              <details key={entry.question} className="glass group rounded-2xl p-5" open={index === 0}>
                <summary className="cursor-pointer list-none font-display text-base font-medium marker:hidden">
                  <span className="flex items-center justify-between gap-4">
                    {entry.question}
                    <span className="font-mono text-xs text-muted-foreground transition group-open:rotate-45">+</span>
                  </span>
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{entry.answer}</p>
              </details>
            ))}
          </div>
        </section>

        <section id="a11y" className="mt-14 scroll-mt-24">
          <SectionHeading
            eyebrow="Accessibility"
            title="Playable by design, not by accident"
            description="The original build disabled pinch-zoom and trapped keyboard input globally. Both are fixed."
          />
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {[
              { icon: <Eye className="h-4 w-4" />, title: 'Visible focus', body: 'Every interactive element has a consistent focus ring; a skip link jumps straight to content.' },
              { icon: <Accessibility className="h-4 w-4" />, title: 'Reduced motion', body: 'A system-level preference and an in-app toggle both remove parallax, drift and shake.' },
              { icon: <Gauge className="h-4 w-4" />, title: 'Performance options', body: 'Particle density can be dialled down; the simulation is unaffected by visual settings.' },
              { icon: <Rocket className="h-4 w-4" />, title: 'Keyboard first', body: 'Arrow keys or A/D move, Space or J fires, Shift triggers Overdrive, P or Escape pauses.' },
            ].map((item) => (
              <div key={item.title} className="glass rounded-2xl p-4">
                <p className="flex items-center gap-2 text-sm font-medium">
                  <span className="text-primary">{item.icon}</span>
                  {item.title}
                </p>
                <p className="mt-1.5 text-xs text-muted-foreground">{item.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-14">
          <Panel className="px-6 py-10 text-center">
            <h2 className="font-display text-2xl font-semibold">Enough reading. The armada is massing.</h2>
            <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
              Fly a sortie, then click your own score on the board and inspect the evidence — seed, tick count, engine version
              and checksum are all public.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <PlayNowButton />
              <Link
                to="/leaderboards"
                className="rounded-full border border-white/12 bg-white/[0.04] px-5 py-3 text-sm font-medium transition hover:border-primary/40"
              >
                Browse verified runs
              </Link>
            </div>
          </Panel>
        </section>
      </div>
    </>
  );
}
