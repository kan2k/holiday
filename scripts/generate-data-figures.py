"""Generate data-driven figures from final-report.md tables.

Matches the minimalist academic style of existing fig1-fig8 architecture diagrams:
- Pure white background, subtle gray grid
- Sans-serif typography
- Restrained palette
- Headline + subtitle pattern at the top of each figure

Outputs (sequentially numbered Fig 9 - Fig 15):
  fig9-cost-breakdown.png         - Operational cost asymmetry
  fig10-decision-distribution.png - Persona-driven decision distribution
  fig11-compaction-compression.png- Smart compaction vs. context limit
  fig12-topic-coverage.png        - Research prompt topic coverage
  fig13-equity-crash.png          - Equity curve, crash period
  fig14-equity-recovery.png       - Equity curve, recovery period
  fig15-equity-stable.png         - Equity curve, stable period
"""

from __future__ import annotations

from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np

# -----------------------------------------------------------------------------
# Style
# -----------------------------------------------------------------------------

OUT_DIR = Path(__file__).resolve().parent.parent / "docs" / "figures"
OUT_DIR.mkdir(parents=True, exist_ok=True)

plt.rcParams.update(
    {
        "font.family": "DejaVu Sans",
        "font.size": 10,
        "axes.titlesize": 11,
        "axes.labelsize": 10,
        "xtick.labelsize": 9,
        "ytick.labelsize": 9,
        "legend.fontsize": 9,
        "axes.spines.top": False,
        "axes.spines.right": False,
        "axes.edgecolor": "#999999",
        "axes.linewidth": 0.8,
        "axes.grid": True,
        "grid.color": "#EEEEEE",
        "grid.linewidth": 0.6,
        "axes.axisbelow": True,
        "figure.facecolor": "#FFFFFF",
        "axes.facecolor": "#FFFFFF",
        "savefig.facecolor": "#FFFFFF",
        "savefig.edgecolor": "#FFFFFF",
        "savefig.dpi": 160,
        "savefig.bbox": "tight",
        "savefig.pad_inches": 0.3,
        "savefig.transparent": False,
    }
)

INK = "#1F1F1F"
MUTED = "#6B6B6B"
ACCENT = "#2563EB"        # blue
ACCENT_2 = "#DC2626"      # red
ACCENT_3 = "#059669"      # green
NEUTRAL = "#9CA3AF"       # light gray
DARK = "#374151"          # dark gray


def add_header(fig, title: str, subtitle: str | None = None) -> None:
    fig.suptitle(title, fontsize=13, fontweight="bold", color=INK, y=1.02)
    if subtitle:
        fig.text(0.5, 0.97, subtitle, ha="center", fontsize=10, color=MUTED)


def save(fig, name: str) -> None:
    path = OUT_DIR / name
    fig.savefig(path, facecolor="#FFFFFF")
    plt.close(fig)
    print(f"wrote {path.relative_to(OUT_DIR.parent.parent)}")


# -----------------------------------------------------------------------------
# Fig 9. Operational cost breakdown (Table 11)
# -----------------------------------------------------------------------------

def fig9_cost_breakdown() -> None:
    fig, (ax1, ax2) = plt.subplots(
        1, 2, figsize=(11, 4.8), gridspec_kw={"width_ratios": [1, 1.1]}
    )

    components = ["Research", "Decision", "Review"]
    costs = [58.00, 0.10, 0.09]
    colors = [ACCENT_2, DARK, NEUTRAL]

    wedges, _texts = ax1.pie(
        costs,
        colors=colors,
        startangle=90,
        wedgeprops={"edgecolor": "white", "linewidth": 2},
    )
    ax1.text(0, 0, "99.7%\nResearch", ha="center", va="center",
             color="white", fontsize=14, fontweight="bold")
    ax1.text(0, -1.25, "Decision + Review combined: 0.3%",
             ha="center", fontsize=9, color=MUTED)

    legend_labels = [
        f"Research (Perplexity) — ${costs[0]:.2f}",
        f"Decision (Kimi K2.5) — ${costs[1]:.2f}",
        f"Review (Kimi K2.5) — ${costs[2]:.2f}",
    ]
    ax1.legend(wedges, legend_labels, loc="upper center",
               bbox_to_anchor=(0.5, -0.05), frameon=False, fontsize=9)
    ax1.set_title("Cost share (29-day backtest)", color=INK, pad=12)

    labels = ["Research", "Decision", "Review"]
    calls = [29, 29, 28]
    cost_per_call = [c / n for c, n in zip(costs, calls)]

    y = np.arange(len(labels))
    ax2.barh(y, cost_per_call, color=colors, edgecolor="white", height=0.55)
    for i, v in enumerate(cost_per_call):
        ax2.text(v, i, f"  ${v:.4f}/call", va="center", fontsize=9, color=INK)
    ax2.set_yticks(y, labels)
    ax2.invert_yaxis()
    ax2.set_xscale("log")
    ax2.set_xlabel("USD per call (log scale)")
    ax2.set_title("Per-call cost (log scale)", color=INK, pad=12)
    ax2.set_xlim(0.001, 10)
    ax2.grid(axis="y", visible=False)

    add_header(
        fig,
        "Fig. 9. Operational Cost Asymmetry",
        "Research dominates 99.7% of total spend; decision + review combined cost $0.19 over 29 days",
    )
    fig.subplots_adjust(top=0.85, wspace=0.35)
    save(fig, "fig9-cost-breakdown.png")


# -----------------------------------------------------------------------------
# Fig 10. Persona-driven decision distribution (Table 10e)
# -----------------------------------------------------------------------------

def fig10_decision_distribution() -> None:
    agents = ["my-trader\n(n=88)", "contrarian-trader\n(n=15)", "commodity-trader\n(n=5)"]
    hold = [69.3, 60.0, 40.0]
    long_ = [8.0, 40.0, 60.0]
    short = [22.7, 0.0, 0.0]

    fig, ax = plt.subplots(figsize=(10, 4.6))
    y = np.arange(len(agents))

    bars1 = ax.barh(y, hold, color=NEUTRAL, label="HOLD", edgecolor="white", height=0.55)
    bars2 = ax.barh(y, long_, left=hold, color=ACCENT_3, label="LONG", edgecolor="white", height=0.55)
    bars3 = ax.barh(y, short, left=[h + l for h, l in zip(hold, long_)],
                    color=ACCENT_2, label="SHORT", edgecolor="white", height=0.55)

    for bars, vals in [(bars1, hold), (bars2, long_), (bars3, short)]:
        for b, v in zip(bars, vals):
            if v >= 6:
                ax.text(
                    b.get_x() + b.get_width() / 2,
                    b.get_y() + b.get_height() / 2,
                    f"{v:.1f}%",
                    ha="center",
                    va="center",
                    color="white",
                    fontsize=9,
                    fontweight="bold",
                )

    ax.set_yticks(y, agents)
    ax.set_xlabel("Share of decisions (%)")
    ax.set_xlim(0, 100)
    ax.invert_yaxis()
    ax.legend(loc="upper right", bbox_to_anchor=(1.0, 1.18), ncol=3, frameon=False)
    ax.grid(axis="y", visible=False)

    add_header(
        fig,
        "Fig. 10. Persona-Driven Decision Distribution",
        "All agents prefer HOLD; only the momentum persona takes SHORT positions",
    )
    fig.subplots_adjust(top=0.83, left=0.2)
    save(fig, "fig10-decision-distribution.png")


# -----------------------------------------------------------------------------
# Fig 11. Smart compaction effectiveness (Table 10b)
# -----------------------------------------------------------------------------

def fig11_compaction_compression() -> None:
    scenarios = ["20 decisions\n(no compaction)", "3 full +\n17 micro", "3 full +\n50 micro", "3 full +\n100 micro"]
    tokens = [90875, 16181, 21181, 28681]
    context_limit = 128000

    fig, ax = plt.subplots(figsize=(10, 5))
    x = np.arange(len(scenarios))
    colors = [ACCENT_2, ACCENT_3, ACCENT_3, ACCENT_3]
    bars = ax.bar(x, tokens, color=colors, edgecolor="white", width=0.55)

    for b, t in zip(bars, tokens):
        pct = t / context_limit * 100
        ax.text(
            b.get_x() + b.get_width() / 2,
            b.get_height() + 1500,
            f"{t:,}\n({pct:.1f}% of limit)",
            ha="center",
            fontsize=9,
            color=INK,
        )

    ax.axhline(context_limit, color=MUTED, linestyle="--", linewidth=1)
    ax.text(
        len(scenarios) - 0.5, context_limit - 5000,
        f"Kimi K2.5 context limit (128,000)",
        ha="right", fontsize=9, color=MUTED,
    )

    ax.set_xticks(x, scenarios)
    ax.set_ylabel("Tokens per iteration")
    ax.set_ylim(0, context_limit * 1.05)
    ax.set_yticks(np.arange(0, 130001, 20000))
    ax.set_yticklabels([f"{int(v/1000)}k" for v in np.arange(0, 130001, 20000)])

    add_header(
        fig,
        "Fig. 11. Smart Compaction Keeps Context Bounded",
        "5.6× compression at 20 decisions; even 100-decision history stays under 23% of model limit",
    )
    fig.subplots_adjust(top=0.86)
    save(fig, "fig11-compaction-compression.png")


# -----------------------------------------------------------------------------
# Fig 12. Topic coverage matrix simple vs complex (Table 5c-i)
# -----------------------------------------------------------------------------

def fig12_topic_coverage() -> None:
    categories = [
        "BTC Price Data", "ETH Price Data", "Altcoin Coverage", "Technical Indicators",
        "On-Chain Metrics", "Institutional Activity", "Macro Economic Data", "Fed Policy",
        "Geopolitical Events", "Regulatory Developments", "Derivatives Market",
        "Stablecoin Dynamics", "Risk Assessment", "Forward-Looking Catalysts",
        "DeFi & Protocol News",
    ]
    simple = [26.5, 42.8, 24.5, 57.8, 6.8, 26.0, 64.5, 33.5, 73.3, 64.3, 5.5, 15.5, 26.3, 25.5, 22.8]
    complex_ = [23.0, 19.0, 10.6, 28.9, 3.8, 22.6, 16.8, 11.0, 45.1, 16.5, 9.5, 2.0, 15.0, 10.5, 10.6]

    y = np.arange(len(categories))
    h = 0.4

    fig, ax = plt.subplots(figsize=(11, 7))
    ax.barh(y - h / 2, simple, h, color=ACCENT, label="Simple prompt (4 tokens)", edgecolor="white")
    ax.barh(y + h / 2, complex_, h, color=ACCENT_2, label="Complex prompt (1,127 tokens)", edgecolor="white")

    ax.set_yticks(y, categories)
    ax.invert_yaxis()
    ax.set_xlabel("Average mentions per report (n=8 dates)")
    ax.legend(loc="lower right", frameon=False)
    ax.grid(axis="y", visible=False)

    add_header(
        fig,
        "Fig. 12. Research Prompt — Topic Coverage Density",
        "Simple prompt outperforms complex on 12 of 15 categories despite 282× fewer input tokens",
    )
    fig.subplots_adjust(top=0.91, left=0.28)
    save(fig, "fig12-topic-coverage.png")


# -----------------------------------------------------------------------------
# Equity curve helpers (used by Fig 13, 14, 15)
# -----------------------------------------------------------------------------

def _build_daily_equity(start_balance, dates, trade_pnl_by_date):
    equity = []
    cumulative = start_balance
    for d in dates:
        cumulative += trade_pnl_by_date.get(d, 0.0)
        equity.append(cumulative)
    return equity


def _interpolate_buyhold(start_eth, end_eth, n_days, start_balance, lev, alloc):
    notional = start_balance * alloc * lev
    units = notional / start_eth
    prices = np.linspace(start_eth, end_eth, n_days)
    return [start_balance + (p - start_eth) * units for p in prices]


def _equity_panel(
    fig_num: int,
    filename: str,
    title: str,
    subtitle: str,
    dates: list[str],
    equity: list[float],
    buyhold: list[float],
    sl_days: set[str],
    tp_days: set[str],
    summary: dict,
    box_loc: tuple[float, float] = (0.02, 0.97),
    box_anchor: str = "left",
) -> None:
    fig, ax = plt.subplots(figsize=(11, 5.2))
    x = np.arange(len(dates))

    ax.plot(x, equity, color=ACCENT, linewidth=2.4, marker="o", markersize=5,
            label="Agent equity")
    ax.plot(x, buyhold, color=ACCENT_2, linewidth=2.0, linestyle="--",
            marker="s", markersize=4, alpha=0.9,
            label="Buy-and-hold (50% margin, 3× lev)")

    sl_plotted = False
    tp_plotted = False
    for xi, di, yi in zip(x, dates, equity):
        if di in sl_days:
            ax.scatter(xi, yi, s=110, color=ACCENT_2, marker="v", zorder=5,
                       edgecolor="white", linewidth=1.4,
                       label="Stop-loss trigger" if not sl_plotted else None)
            sl_plotted = True
        elif di in tp_days:
            ax.scatter(xi, yi, s=140, color=ACCENT_3, marker="^", zorder=5,
                       edgecolor="white", linewidth=1.4,
                       label="Take-profit trigger" if not tp_plotted else None)
            tp_plotted = True

    ax.axhline(10000, color=MUTED, linestyle=":", linewidth=0.9,
               label="$10,000 starting balance")

    step = max(1, len(dates) // 12)
    tick_idx = list(range(0, len(dates), step))
    if (len(dates) - 1) not in tick_idx:
        tick_idx.append(len(dates) - 1)
    ax.set_xticks(tick_idx, [dates[i] for i in tick_idx], rotation=35, ha="right")

    ax.set_ylabel("Portfolio equity (USD)")
    y_min = min(min(equity), min(buyhold)) - 200
    y_max = max(max(equity), max(buyhold)) + 350
    ax.set_ylim(y_min, y_max)
    ax.yaxis.set_major_formatter(plt.FuncFormatter(lambda v, _: f"${v:,.0f}"))

    ax.text(
        box_loc[0], box_loc[1],
        f"Agent PnL:  {summary['agent_pct']}  ({summary['agent_dollar']})\n"
        f"Buy-and-hold:  {summary['bh_pct']}  ({summary['bh_dollar']})\n"
        f"Outperformance:  {summary['outperf']}\n"
        f"Trades:  {summary['trades']}   "
        f"SL/TP:  {summary['sl']}/{summary['tp']}",
        transform=ax.transAxes, va="top", ha=box_anchor,
        fontsize=9.5, color=INK,
        bbox=dict(boxstyle="round,pad=0.5", facecolor="white",
                  edgecolor="#D1D5DB", linewidth=0.8),
    )

    ax.legend(loc="lower right", frameon=False, fontsize=9)

    add_header(fig, title, subtitle)
    fig.subplots_adjust(top=0.86, bottom=0.18)
    save(fig, filename)


def fig13_equity_crash() -> None:
    dates = ["Jan 30", "Jan 31", "Feb 1", "Feb 2", "Feb 3", "Feb 4", "Feb 5",
             "Feb 6", "Feb 7", "Feb 8", "Feb 9", "Feb 10", "Feb 11", "Feb 12"]
    pnl = {
        "Jan 30": -150.00, "Jan 31": -221.62, "Feb 1": 146.69, "Feb 2": -293.25,
        "Feb 3": -355.57, "Feb 4": -273.79, "Feb 5": 531.15, "Feb 6": 32.49,
        "Feb 7": 5.89, "Feb 8": 31.26, "Feb 9": -212.70, "Feb 10": -207.91,
        "Feb 11": 11.31, "Feb 12": 0.0,
    }
    sl = {"Jan 30", "Jan 31", "Feb 2", "Feb 3", "Feb 4", "Feb 9", "Feb 10"}
    tp = {"Feb 5"}
    equity = _build_daily_equity(10000, dates, pnl)
    buyhold = _interpolate_buyhold(2706.30, 1947.00, len(dates), 10000, 3, 0.5)
    _equity_panel(
        13, "fig13-equity-crash.png",
        "Fig. 13. Equity Curve — Crash Period (Jan 30 – Feb 12)",
        "contrarian-trader: agent loss capped at −9.56% during a −28% ETH decline; SL bounded losses, single TP recovered 55% of cumulative drawdown",
        dates, equity, buyhold, sl, tp,
        summary={
            "agent_pct": "−9.56%", "agent_dollar": "−$956.05",
            "bh_pct": "−42.1%", "bh_dollar": "−$4,212",
            "outperf": "+32.6 pp", "trades": 13, "sl": 7, "tp": 1,
        },
        box_loc=(0.98, 0.97), box_anchor="right",
    )


def fig14_equity_recovery() -> None:
    dates = ["Feb 13", "Feb 14", "Feb 15", "Feb 16", "Feb 17", "Feb 18",
             "Feb 19", "Feb 20", "Feb 21", "Feb 22", "Feb 23", "Feb 24",
             "Feb 25", "Feb 26"]
    pnl = {
        "Feb 13": 82.85, "Feb 14": -151.24, "Feb 19": 45.42, "Feb 20": 3.42,
        "Feb 21": -11.84, "Feb 22": -44.86, "Feb 24": 297.71,
    }
    sl = {"Feb 14", "Feb 22"}
    tp = {"Feb 24"}
    equity = _build_daily_equity(10000, dates, pnl)
    buyhold = _interpolate_buyhold(2047.60, 2027.00, len(dates), 10000, 3, 0.5)
    _equity_panel(
        14, "fig14-equity-recovery.png",
        "Fig. 14. Equity Curve — Recovery Period (Feb 13 – Feb 26)",
        "Patient capital deployment: agent waited through 5 HOLD days then captured the V-bottom on Feb 24 via the take-profit mechanism",
        dates, equity, buyhold, sl, tp,
        summary={
            "agent_pct": "+2.21%", "agent_dollar": "+$221.47",
            "bh_pct": "−1.5%", "bh_dollar": "−$154",
            "outperf": "+3.7 pp", "trades": 7, "sl": 2, "tp": 1,
        },
        box_loc=(0.02, 0.97), box_anchor="left",
    )


def fig15_equity_stable() -> None:
    dates = ["Feb 28", "Mar 1", "Mar 2", "Mar 3", "Mar 4", "Mar 5", "Mar 6",
             "Mar 7", "Mar 8", "Mar 9", "Mar 10", "Mar 11", "Mar 12", "Mar 13"]
    pnl = {"Mar 12": -31.30}
    sl: set[str] = set()
    tp: set[str] = set()
    equity = _build_daily_equity(10000, dates, pnl)
    buyhold = _interpolate_buyhold(1835.00, 1953.00, len(dates), 10000, 3, 0.5)
    _equity_panel(
        15, "fig15-equity-stable.png",
        "Fig. 15. Equity Curve — Stable Period (Feb 28 – Mar 13)",
        "Capital preservation by design: 12/14 HOLD days; the contrarian persona abstains in the absence of sentiment extremes, sacrificing trend returns for crash resilience",
        dates, equity, buyhold, sl, tp,
        summary={
            "agent_pct": "−0.31%", "agent_dollar": "−$31.30",
            "bh_pct": "+9.8%", "bh_dollar": "+$978",
            "outperf": "−10.1 pp", "trades": 1, "sl": 0, "tp": 0,
        },
        box_loc=(0.02, 0.97), box_anchor="left",
    )


# -----------------------------------------------------------------------------
# Run
# -----------------------------------------------------------------------------

if __name__ == "__main__":
    fig9_cost_breakdown()
    fig10_decision_distribution()
    fig11_compaction_compression()
    fig12_topic_coverage()
    fig13_equity_crash()
    fig14_equity_recovery()
    fig15_equity_stable()
    print(f"\nAll figures saved to {OUT_DIR}")
