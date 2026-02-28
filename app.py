from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from typing import Callable

import numpy as np
import plotly.graph_objects as go
import streamlit as st
from scipy.integrate import quad
from scipy.stats import norm

EPS = 1e-9

CONTRACT_DESCRIPTIONS = {
    "Wholesale Price Contract": (
        "Evaluate stocking and profitability under standard wholesale procurement with optional "
        "inventory and shortage cost components."
    ),
    "Buyback Contract": (
        "Analyze retailer and manufacturer incentives when unsold inventory can be returned at a "
        "buyback price."
    ),
    "Revenue Sharing Contract": (
        "Assess profit allocation between channel partners when downstream sales revenue is shared."
    ),
    "Option Contract": (
        "Compare hedging with capacity options versus pure spot-market purchasing under uncertain demand."
    ),
    "Quantity Flexibility Contract": (
        "Optimize final order adjustments around an initial commitment within a predefined flexibility band."
    ),
}

PALETTE = {
    "bg": "#0e1117",
    "card": "#161b22",
    "text": "#e6edf3",
    "primary": "#00d4ff",
    "secondary": "#ff8c42",
    "accent": "#7ee787",
    "danger": "#ff4d6d",
    "muted": "#8b949e",
}


def apply_dark_theme() -> None:
    st.set_page_config(
        page_title="Supply Chain Contract Decision Lab",
        page_icon="SC",
        layout="wide",
        initial_sidebar_state="expanded",
    )
    st.markdown(
        f"""
        <style>
            .stApp {{
                background-color: {PALETTE["bg"]};
                color: {PALETTE["text"]};
            }}
            [data-testid="stSidebar"] {{
                background: linear-gradient(180deg, #111827 0%, #0e1117 100%);
                border-right: 1px solid #1f2937;
            }}
            .block-container {{
                padding-top: 1.2rem;
                padding-bottom: 2rem;
            }}
            .contract-card {{
                background: linear-gradient(135deg, #161b22 0%, #1b2330 100%);
                border: 1px solid #263245;
                border-radius: 12px;
                padding: 1rem 1.1rem;
                margin-bottom: 1rem;
                color: {PALETTE["text"]};
            }}
            .section-title {{
                margin-top: 0.6rem;
                margin-bottom: 0.4rem;
            }}
            .stMetric {{
                background-color: {PALETTE["card"]};
                border: 1px solid #263245;
                border-radius: 10px;
                padding: 0.55rem;
            }}
            .stAlert {{
                border-radius: 10px;
            }}
            div.stButton > button {{
                border-radius: 10px;
                font-weight: 600;
                border: 1px solid #31506e;
            }}
        </style>
        """,
        unsafe_allow_html=True,
    )


def fmt_currency(value: float) -> str:
    return f"${value:,.2f}"


def fmt_number(value: float) -> str:
    return f"{value:,.2f}"


def fmt_percent(value: float) -> str:
    return f"{100.0 * value:,.2f}%"


def clamp(value: float, low: float, high: float) -> float:
    return float(max(low, min(value, high)))


def inventory_stats(order_qty: float, demand: float) -> dict[str, float]:
    sales = min(order_qty, demand)
    leftover = max(order_qty - demand, 0.0)
    unmet = max(demand - order_qty, 0.0)
    service_level = 1.0 if demand <= EPS else np.clip(sales / demand, 0.0, 1.0)
    return {
        "sales": float(sales),
        "leftover": float(leftover),
        "unmet": float(unmet),
        "service_level": float(service_level),
    }


def inventory_adjustment(leftover: float, unmet: float, costs: dict[str, float]) -> dict[str, float]:
    salvage = costs.get("salvage", 0.0) * leftover
    holding = costs.get("holding", 0.0) * leftover
    shortage = costs.get("shortage", 0.0) * unmet
    penalty = costs.get("penalty", 0.0) * unmet
    net = salvage - holding - shortage - penalty
    return {
        "salvage": float(salvage),
        "holding": float(holding),
        "shortage": float(shortage),
        "penalty": float(penalty),
        "net": float(net),
    }


def parse_float_list(text: str) -> list[float]:
    items = [part.strip() for part in text.replace("\n", ",").split(",")]
    values: list[float] = []
    for item in items:
        if item == "":
            continue
        values.append(float(item))
    return values


@lru_cache(maxsize=4096)
def normal_expected_sales(mean: float, std: float, order_qty: float) -> float:
    mean = float(mean)
    std = float(std)
    order_qty = max(float(order_qty), 0.0)
    if std <= EPS:
        return float(min(max(mean, 0.0), order_qty))
    distribution = norm(loc=mean, scale=std)
    expected, _ = quad(
        lambda d: min(order_qty, d) * distribution.pdf(d),
        0.0,
        np.inf,
        limit=250,
    )
    return float(expected)


@lru_cache(maxsize=1024)
def normal_expected_demand(mean: float, std: float) -> float:
    mean = float(mean)
    std = float(std)
    if std <= EPS:
        return float(max(mean, 0.0))
    distribution = norm(loc=mean, scale=std)
    expected, _ = quad(lambda d: d * distribution.pdf(d), 0.0, np.inf, limit=250)
    return float(expected)


@dataclass
class DemandModel:
    mode: str
    distribution: str
    params: dict

    @property
    def is_random(self) -> bool:
        return self.mode == "Random"

    def expected_of(self, fn: Callable[[float], float]) -> float:
        if self.distribution == "deterministic":
            return float(fn(float(self.params["demand"])))

        if self.distribution == "normal":
            mean = float(self.params["mean"])
            std = float(self.params["std"])
            if std <= EPS:
                return float(fn(max(mean, 0.0)))
            distribution = norm(loc=mean, scale=std)
            negative_mass = float(distribution.cdf(0.0))
            integral, _ = quad(lambda d: fn(d) * distribution.pdf(d), 0.0, np.inf, limit=250)
            return float(integral + fn(0.0) * negative_mass)

        if self.distribution == "uniform":
            low = float(self.params["low"])
            high = float(self.params["high"])
            if abs(high - low) <= EPS:
                return float(fn(low))
            pdf = 1.0 / (high - low)
            integral, _ = quad(lambda d: fn(d) * pdf, low, high, limit=250)
            return float(integral)

        if self.distribution == "discrete":
            demands = self.params["demands"]
            probabilities = self.params["probabilities"]
            evaluated = np.array([fn(float(d)) for d in demands], dtype=float)
            return float(np.dot(evaluated, probabilities))

        raise ValueError("Unsupported demand distribution.")

    def cdf(self, x: float) -> float:
        x = float(x)
        if self.distribution == "deterministic":
            return float(1.0 if x >= float(self.params["demand"]) else 0.0)

        if self.distribution == "normal":
            mean = float(self.params["mean"])
            std = float(self.params["std"])
            if std <= EPS:
                return float(1.0 if x >= max(mean, 0.0) else 0.0)
            distribution = norm(loc=mean, scale=std)
            if x <= 0.0:
                return float(distribution.cdf(0.0))
            return float(distribution.cdf(x))

        if self.distribution == "uniform":
            low = float(self.params["low"])
            high = float(self.params["high"])
            if x <= low:
                return 0.0
            if x >= high:
                return 1.0
            return float((x - low) / max(high - low, EPS))

        if self.distribution == "discrete":
            demands = self.params["demands"]
            probabilities = self.params["probabilities"]
            mask = demands <= x
            return float(np.sum(probabilities[mask]))

        return 0.0

    def ppf(self, probability: float) -> float:
        probability = float(np.clip(probability, 0.0, 1.0))
        if self.distribution == "deterministic":
            return float(self.params["demand"])

        if self.distribution == "normal":
            mean = float(self.params["mean"])
            std = float(self.params["std"])
            if std <= EPS:
                return float(max(mean, 0.0))
            quantile = float(norm.ppf(probability, loc=mean, scale=std))
            return float(max(quantile, 0.0))

        if self.distribution == "uniform":
            low = float(self.params["low"])
            high = float(self.params["high"])
            return float(low + probability * (high - low))

        if self.distribution == "discrete":
            demands = self.params["demands"]
            probabilities = self.params["probabilities"]
            cumulative = np.cumsum(probabilities)
            idx = int(np.searchsorted(cumulative, probability, side="left"))
            idx = min(idx, len(demands) - 1)
            return float(demands[idx])

        return 0.0

    def metrics(self, order_qty: float) -> dict[str, float]:
        order_qty = max(float(order_qty), 0.0)
        if self.distribution == "normal":
            mean = float(self.params["mean"])
            std = float(self.params["std"])
            expected_sales = normal_expected_sales(mean, std, order_qty)
            expected_demand = normal_expected_demand(mean, std)
        else:
            expected_sales = self.expected_of(lambda d: min(order_qty, d))
            expected_demand = self.expected_of(lambda d: d)

        expected_leftover = max(order_qty - expected_sales, 0.0)
        expected_unmet = max(expected_demand - expected_sales, 0.0)
        service_level = 1.0 if expected_demand <= EPS else np.clip(expected_sales / expected_demand, 0.0, 1.0)
        stockout_probability = float(np.clip(1.0 - self.cdf(order_qty), 0.0, 1.0))
        return {
            "expected_sales": float(expected_sales),
            "expected_demand": float(expected_demand),
            "expected_leftover": float(expected_leftover),
            "expected_unmet": float(expected_unmet),
            "service_level": float(service_level),
            "stockout_probability": stockout_probability,
        }

    def demand_grid(self, num_points: int = 100) -> np.ndarray:
        if self.distribution == "deterministic":
            demand = float(self.params["demand"])
            upper = max(1.0, demand * 2.0)
            return np.linspace(0.0, upper, num_points)

        if self.distribution == "normal":
            upper = max(1.0, self.ppf(0.995))
            return np.linspace(0.0, upper, num_points)

        if self.distribution == "uniform":
            low = float(self.params["low"])
            high = float(self.params["high"])
            if abs(high - low) <= EPS:
                upper = max(1.0, low * 2.0)
                return np.linspace(0.0, upper, num_points)
            return np.linspace(low, high, num_points)

        if self.distribution == "discrete":
            demands = np.sort(np.array(self.params["demands"], dtype=float))
            if len(demands) == 1:
                upper = max(1.0, demands[0] * 2.0)
                return np.linspace(0.0, upper, num_points)
            return demands

        return np.linspace(0.0, 100.0, num_points)

    def max_reasonable_demand(self) -> float:
        if self.distribution == "deterministic":
            return max(1.0, float(self.params["demand"]))
        if self.distribution == "normal":
            return max(1.0, self.ppf(0.995))
        if self.distribution == "uniform":
            return max(1.0, float(self.params["high"]))
        if self.distribution == "discrete":
            return max(1.0, float(np.max(self.params["demands"])))
        return 100.0


def demand_handler(demand_type: str, distribution_type: str | None, key_prefix: str) -> DemandModel | None:
    st.markdown("#### Demand Inputs")
    if demand_type == "Deterministic":
        demand = st.number_input(
            "Demand",
            min_value=0.0,
            value=100.0,
            step=1.0,
            key=f"{key_prefix}_demand_value",
        )
        return DemandModel(mode="Deterministic", distribution="deterministic", params={"demand": float(demand)})

    if distribution_type == "Normal Distribution":
        c1, c2 = st.columns(2)
        with c1:
            mean = st.number_input(
                "Demand Mean",
                min_value=0.0,
                value=100.0,
                step=1.0,
                key=f"{key_prefix}_normal_mean",
            )
        with c2:
            std = st.number_input(
                "Demand Standard Deviation",
                min_value=0.0,
                value=20.0,
                step=1.0,
                key=f"{key_prefix}_normal_std",
            )
        return DemandModel(mode="Random", distribution="normal", params={"mean": float(mean), "std": float(std)})

    if distribution_type == "Uniform Distribution":
        c1, c2 = st.columns(2)
        with c1:
            low = st.number_input(
                "Uniform Lower Bound",
                min_value=0.0,
                value=60.0,
                step=1.0,
                key=f"{key_prefix}_uniform_low",
            )
        with c2:
            high = st.number_input(
                "Uniform Upper Bound",
                min_value=0.0,
                value=140.0,
                step=1.0,
                key=f"{key_prefix}_uniform_high",
            )
        if high < low:
            st.error("Uniform upper bound must be greater than or equal to lower bound.")
            return None
        return DemandModel(mode="Random", distribution="uniform", params={"low": float(low), "high": float(high)})

    if distribution_type == "Discrete Distribution":
        st.caption("Enter comma-separated values.")
        demands_text = st.text_area(
            "Demand Values",
            value="60, 100, 140",
            key=f"{key_prefix}_discrete_demands",
        )
        probs_text = st.text_area(
            "Probabilities",
            value="0.2, 0.5, 0.3",
            key=f"{key_prefix}_discrete_probs",
        )

        try:
            demands_raw = parse_float_list(demands_text)
            probs_raw = parse_float_list(probs_text)
        except ValueError:
            st.error("Discrete inputs must be numeric lists.")
            return None

        if len(demands_raw) == 0 or len(probs_raw) == 0:
            st.error("Discrete demand values and probabilities cannot be empty.")
            return None
        if len(demands_raw) != len(probs_raw):
            st.error("Discrete demand values and probabilities must have the same length.")
            return None
        if any(d < 0 for d in demands_raw):
            st.error("Discrete demand values cannot be negative.")
            return None
        if any(p < 0 for p in probs_raw):
            st.error("Probabilities cannot be negative.")
            return None

        total_prob = float(sum(probs_raw))
        if not np.isclose(total_prob, 1.0, atol=1e-4):
            st.error(f"Probabilities must sum to 1. Current sum: {total_prob:.4f}")
            return None

        condensed: dict[float, float] = {}
        for d, p in zip(demands_raw, probs_raw):
            condensed[float(d)] = condensed.get(float(d), 0.0) + float(p)
        demands_sorted = np.array(sorted(condensed.keys()), dtype=float)
        probs_sorted = np.array([condensed[d] for d in demands_sorted], dtype=float)
        probs_sorted = probs_sorted / max(float(np.sum(probs_sorted)), EPS)
        return DemandModel(
            mode="Random",
            distribution="discrete",
            params={"demands": demands_sorted, "probabilities": probs_sorted},
        )

    st.error("Unsupported demand selection.")
    return None


def make_figure(title: str, x_label: str, y_label: str) -> go.Figure:
    fig = go.Figure()
    fig.update_layout(
        title=title,
        xaxis_title=x_label,
        yaxis_title=y_label,
        template="plotly_dark",
        paper_bgcolor=PALETTE["bg"],
        plot_bgcolor=PALETTE["bg"],
        font={"color": PALETTE["text"]},
        hovermode="x unified",
        margin={"l": 40, "r": 25, "t": 52, "b": 40},
        legend={"orientation": "h", "yanchor": "bottom", "y": 1.02, "xanchor": "right", "x": 1.0},
    )
    fig.update_xaxes(gridcolor="#283042")
    fig.update_yaxes(gridcolor="#283042")
    return fig


def wholesale_profit_expected(
    order_qty: float,
    demand_model: DemandModel,
    retail_price: float,
    wholesale_price: float,
    costs: dict[str, float],
) -> float:
    m = demand_model.metrics(order_qty)
    adjust = inventory_adjustment(m["expected_leftover"], m["expected_unmet"], costs)
    return float(retail_price * m["expected_sales"] - wholesale_price * order_qty + adjust["net"])


def wholesale_profit_deterministic(
    order_qty: float,
    demand: float,
    retail_price: float,
    wholesale_price: float,
    costs: dict[str, float],
) -> float:
    s = inventory_stats(order_qty, demand)
    adjust = inventory_adjustment(s["leftover"], s["unmet"], costs)
    return float(retail_price * s["sales"] - wholesale_price * order_qty + adjust["net"])


def buyback_profit_expected(
    order_qty: float,
    demand_model: DemandModel,
    retail_price: float,
    wholesale_price: float,
    buyback_price: float,
    production_cost: float,
    costs: dict[str, float],
) -> tuple[float, float, float]:
    m = demand_model.metrics(order_qty)
    adjust = inventory_adjustment(m["expected_leftover"], m["expected_unmet"], costs)
    retailer = retail_price * m["expected_sales"] + buyback_price * m["expected_leftover"] - wholesale_price * order_qty
    retailer += adjust["net"]
    manufacturer = wholesale_price * order_qty - buyback_price * m["expected_leftover"]
    total = retail_price * m["expected_sales"] - production_cost * order_qty + adjust["net"]
    return float(retailer), float(manufacturer), float(total)


def buyback_profit_deterministic(
    order_qty: float,
    demand: float,
    retail_price: float,
    wholesale_price: float,
    buyback_price: float,
    production_cost: float,
    costs: dict[str, float],
) -> tuple[float, float, float]:
    s = inventory_stats(order_qty, demand)
    adjust = inventory_adjustment(s["leftover"], s["unmet"], costs)
    retailer = retail_price * s["sales"] + buyback_price * s["leftover"] - wholesale_price * order_qty + adjust["net"]
    manufacturer = wholesale_price * order_qty - buyback_price * s["leftover"]
    total = retail_price * s["sales"] - production_cost * order_qty + adjust["net"]
    return float(retailer), float(manufacturer), float(total)


def revenue_sharing_profit_expected(
    order_qty: float,
    demand_model: DemandModel,
    retail_price: float,
    wholesale_price: float,
    alpha: float,
    costs: dict[str, float],
) -> tuple[float, float, float]:
    m = demand_model.metrics(order_qty)
    adjust = inventory_adjustment(m["expected_leftover"], m["expected_unmet"], costs)
    retailer = (1.0 - alpha) * retail_price * m["expected_sales"] - wholesale_price * order_qty + adjust["net"]
    supplier = alpha * retail_price * m["expected_sales"] + wholesale_price * order_qty
    total = retailer + supplier
    return float(retailer), float(supplier), float(total)


def revenue_sharing_profit_deterministic(
    order_qty: float,
    demand: float,
    retail_price: float,
    wholesale_price: float,
    alpha: float,
    costs: dict[str, float],
) -> tuple[float, float, float]:
    s = inventory_stats(order_qty, demand)
    adjust = inventory_adjustment(s["leftover"], s["unmet"], costs)
    retailer = (1.0 - alpha) * retail_price * s["sales"] - wholesale_price * order_qty + adjust["net"]
    supplier = alpha * retail_price * s["sales"] + wholesale_price * order_qty
    total = retailer + supplier
    return float(retailer), float(supplier), float(total)


def option_cost_deterministic(
    demand: float,
    option_qty: float,
    strike: float,
    premium: float,
    spot: float,
) -> dict[str, float]:
    should_exercise = spot > strike
    exercised = min(demand, option_qty) if should_exercise else 0.0
    if should_exercise:
        total_cost = option_qty * premium + exercised * strike + max(demand - exercised, 0.0) * spot
    else:
        total_cost = option_qty * premium + demand * spot
    spot_only = demand * spot
    return {
        "should_exercise": float(1.0 if should_exercise else 0.0),
        "exercised_qty": float(exercised),
        "total_cost": float(total_cost),
        "spot_only_cost": float(spot_only),
    }


def option_cost_expected(
    demand_model: DemandModel,
    option_qty: float,
    strike: float,
    premium: float,
    spot: float,
) -> dict[str, float]:
    m = demand_model.metrics(option_qty)
    expected_min = m["expected_sales"]
    expected_demand = m["expected_demand"]
    should_exercise = spot > strike
    if should_exercise:
        total_cost = option_qty * premium + expected_min * strike + max(expected_demand - expected_min, 0.0) * spot
        exercised_qty = expected_min
    else:
        total_cost = option_qty * premium + expected_demand * spot
        exercised_qty = 0.0
    spot_only = expected_demand * spot
    return {
        "should_exercise": float(1.0 if should_exercise else 0.0),
        "exercised_qty": float(exercised_qty),
        "total_cost": float(total_cost),
        "spot_only_cost": float(spot_only),
        "expected_demand": float(expected_demand),
        "expected_unhedged": float(max(expected_demand - exercised_qty, 0.0)),
    }


def quantity_flex_deterministic(
    demand: float,
    initial_commitment: float,
    adjustment_pct: float,
    wholesale_price: float,
    costs: dict[str, float],
) -> dict[str, float]:
    span = adjustment_pct / 100.0
    lower = max(0.0, initial_commitment * (1.0 - span))
    upper = initial_commitment * (1.0 + span)
    final_order = clamp(demand, lower, upper)
    unmet = max(demand - final_order, 0.0)
    overstock = max(final_order - demand, 0.0)
    procurement = final_order * wholesale_price
    total_cost = procurement
    total_cost += costs.get("holding", 0.0) * overstock
    total_cost += (costs.get("shortage", 0.0) + costs.get("penalty", 0.0)) * unmet
    total_cost -= costs.get("salvage", 0.0) * overstock
    service_level = 1.0 if demand <= EPS else np.clip((demand - unmet) / demand, 0.0, 1.0)
    return {
        "lower": float(lower),
        "upper": float(upper),
        "final_order": float(final_order),
        "unmet": float(unmet),
        "overstock": float(overstock),
        "procurement_cost": float(procurement),
        "total_cost": float(total_cost),
        "service_level": float(service_level),
    }


def quantity_flex_expected(
    demand_model: DemandModel,
    initial_commitment: float,
    adjustment_pct: float,
    wholesale_price: float,
    costs: dict[str, float],
) -> dict[str, float]:
    span = adjustment_pct / 100.0
    lower = max(0.0, initial_commitment * (1.0 - span))
    upper = initial_commitment * (1.0 + span)

    def final_order_fn(demand: float) -> float:
        return clamp(demand, lower, upper)

    final_order = demand_model.expected_of(final_order_fn)
    unmet = demand_model.expected_of(lambda d: max(d - final_order_fn(d), 0.0))
    overstock = demand_model.expected_of(lambda d: max(final_order_fn(d) - d, 0.0))
    expected_demand = demand_model.expected_of(lambda d: d)
    procurement = final_order * wholesale_price
    total_cost = procurement
    total_cost += costs.get("holding", 0.0) * overstock
    total_cost += (costs.get("shortage", 0.0) + costs.get("penalty", 0.0)) * unmet
    total_cost -= costs.get("salvage", 0.0) * overstock
    service_level = 1.0 if expected_demand <= EPS else np.clip((expected_demand - unmet) / expected_demand, 0.0, 1.0)
    return {
        "lower": float(lower),
        "upper": float(upper),
        "final_order": float(final_order),
        "unmet": float(unmet),
        "overstock": float(overstock),
        "procurement_cost": float(procurement),
        "total_cost": float(total_cost),
        "service_level": float(service_level),
        "expected_demand": float(expected_demand),
    }


def graph_functions(
    contract_type: str,
    demand_model: DemandModel,
    params: dict[str, float],
    costs: dict[str, float],
) -> list[go.Figure]:
    figures: list[go.Figure] = []

    if contract_type == "Wholesale Price Contract":
        q_current = params["Q"]
        q_max = max(10.0, q_current * 2.0, demand_model.max_reasonable_demand() * 1.5)
        q_values = np.linspace(0.0, q_max, 70)
        if demand_model.is_random:
            profit_values = [
                wholesale_profit_expected(q, demand_model, params["p"], params["w"], costs) for q in q_values
            ]
        else:
            demand = float(demand_model.params["demand"])
            profit_values = [
                wholesale_profit_deterministic(q, demand, params["p"], params["w"], costs) for q in q_values
            ]

        fig1 = make_figure("Profit vs Order Quantity", "Order Quantity", "Profit")
        fig1.add_trace(
            go.Scatter(
                x=q_values,
                y=profit_values,
                mode="lines",
                name="Profit",
                line={"color": PALETTE["primary"], "width": 3},
            )
        )

        demand_values = demand_model.demand_grid(90)
        demand_profit = [
            wholesale_profit_deterministic(params["Q"], float(d), params["p"], params["w"], costs)
            for d in demand_values
        ]
        fig2 = make_figure("Profit vs Demand", "Demand", "Profit")
        fig2.add_trace(
            go.Scatter(
                x=demand_values,
                y=demand_profit,
                mode="lines",
                name="Profit",
                line={"color": PALETTE["secondary"], "width": 3},
            )
        )
        figures.extend([fig1, fig2])

    elif contract_type == "Buyback Contract":
        q_current = params["Q"]
        q_max = max(10.0, q_current * 2.0, demand_model.max_reasonable_demand() * 1.5)
        q_values = np.linspace(0.0, q_max, 70)
        retailer_curve: list[float] = []
        manufacturer_curve: list[float] = []
        total_curve: list[float] = []
        for q in q_values:
            if demand_model.is_random:
                r, m, t = buyback_profit_expected(
                    q,
                    demand_model,
                    params["p"],
                    params["w"],
                    params["b"],
                    params["c"],
                    costs,
                )
            else:
                demand = float(demand_model.params["demand"])
                r, m, t = buyback_profit_deterministic(
                    q,
                    demand,
                    params["p"],
                    params["w"],
                    params["b"],
                    params["c"],
                    costs,
                )
            retailer_curve.append(r)
            manufacturer_curve.append(m)
            total_curve.append(t)

        fig1 = make_figure("Profit vs Order Quantity", "Order Quantity", "Profit")
        fig1.add_trace(
            go.Scatter(x=q_values, y=retailer_curve, mode="lines", name="Retailer", line={"color": PALETTE["primary"]})
        )
        fig1.add_trace(
            go.Scatter(
                x=q_values,
                y=manufacturer_curve,
                mode="lines",
                name="Manufacturer",
                line={"color": PALETTE["secondary"]},
            )
        )
        fig1.add_trace(
            go.Scatter(x=q_values, y=total_curve, mode="lines", name="Total", line={"color": PALETTE["accent"]})
        )

        demand_values = demand_model.demand_grid(90)
        retailer_demand: list[float] = []
        total_demand: list[float] = []
        for d in demand_values:
            r, _, t = buyback_profit_deterministic(
                params["Q"],
                float(d),
                params["p"],
                params["w"],
                params["b"],
                params["c"],
                costs,
            )
            retailer_demand.append(r)
            total_demand.append(t)
        fig2 = make_figure("Profit vs Demand", "Demand", "Profit")
        fig2.add_trace(
            go.Scatter(
                x=demand_values,
                y=retailer_demand,
                mode="lines",
                name="Retailer",
                line={"color": PALETTE["primary"]},
            )
        )
        fig2.add_trace(
            go.Scatter(
                x=demand_values,
                y=total_demand,
                mode="lines",
                name="Total",
                line={"color": PALETTE["accent"]},
            )
        )
        figures.extend([fig1, fig2])

    elif contract_type == "Revenue Sharing Contract":
        q_current = params["Q"]
        q_max = max(10.0, q_current * 2.0, demand_model.max_reasonable_demand() * 1.5)
        q_values = np.linspace(0.0, q_max, 70)
        retailer_curve: list[float] = []
        supplier_curve: list[float] = []
        total_curve: list[float] = []
        for q in q_values:
            if demand_model.is_random:
                r, s, t = revenue_sharing_profit_expected(
                    q,
                    demand_model,
                    params["p"],
                    params["w"],
                    params["alpha"],
                    costs,
                )
            else:
                demand = float(demand_model.params["demand"])
                r, s, t = revenue_sharing_profit_deterministic(
                    q,
                    demand,
                    params["p"],
                    params["w"],
                    params["alpha"],
                    costs,
                )
            retailer_curve.append(r)
            supplier_curve.append(s)
            total_curve.append(t)

        fig1 = make_figure("Profit vs Order Quantity", "Order Quantity", "Profit")
        fig1.add_trace(
            go.Scatter(x=q_values, y=retailer_curve, mode="lines", name="Retailer", line={"color": PALETTE["primary"]})
        )
        fig1.add_trace(
            go.Scatter(x=q_values, y=supplier_curve, mode="lines", name="Supplier", line={"color": PALETTE["secondary"]})
        )
        fig1.add_trace(
            go.Scatter(x=q_values, y=total_curve, mode="lines", name="Total", line={"color": PALETTE["accent"]})
        )

        demand_values = demand_model.demand_grid(90)
        retailer_demand: list[float] = []
        supplier_demand: list[float] = []
        for d in demand_values:
            r, s, _ = revenue_sharing_profit_deterministic(
                params["Q"],
                float(d),
                params["p"],
                params["w"],
                params["alpha"],
                costs,
            )
            retailer_demand.append(r)
            supplier_demand.append(s)
        fig2 = make_figure("Profit vs Demand", "Demand", "Profit")
        fig2.add_trace(
            go.Scatter(
                x=demand_values,
                y=retailer_demand,
                mode="lines",
                name="Retailer",
                line={"color": PALETTE["primary"]},
            )
        )
        fig2.add_trace(
            go.Scatter(
                x=demand_values,
                y=supplier_demand,
                mode="lines",
                name="Supplier",
                line={"color": PALETTE["secondary"]},
            )
        )
        figures.extend([fig1, fig2])

    elif contract_type == "Option Contract":
        option_qty = params["option_qty"]
        strike = params["strike"]
        premium = params["premium"]
        spot = params["spot"]
        spot_min = max(0.0, min(spot, strike) * 0.4)
        spot_max = max(spot, strike, strike + premium) * 1.8 + 1.0
        spot_values = np.linspace(spot_min, spot_max, 90)

        if demand_model.is_random:
            base_metrics = demand_model.metrics(option_qty)
            expected_min = base_metrics["expected_sales"]
            expected_demand = base_metrics["expected_demand"]
            option_curve = []
            spot_curve = []
            for s in spot_values:
                if s > strike:
                    total_cost = option_qty * premium + expected_min * strike + (expected_demand - expected_min) * s
                else:
                    total_cost = option_qty * premium + expected_demand * s
                option_curve.append(total_cost)
                spot_curve.append(expected_demand * s)
        else:
            demand = float(demand_model.params["demand"])
            option_curve = []
            spot_curve = []
            for s in spot_values:
                eval_cost = option_cost_deterministic(demand, option_qty, strike, premium, float(s))
                option_curve.append(eval_cost["total_cost"])
                spot_curve.append(eval_cost["spot_only_cost"])

        fig1 = make_figure("Cost vs Spot Price", "Spot Price", "Total Cost")
        fig1.add_trace(
            go.Scatter(
                x=spot_values,
                y=option_curve,
                mode="lines",
                name="Option Strategy",
                line={"color": PALETTE["primary"]},
            )
        )
        fig1.add_trace(
            go.Scatter(
                x=spot_values,
                y=spot_curve,
                mode="lines",
                name="Pure Spot Strategy",
                line={"color": PALETTE["secondary"]},
            )
        )
        fig1.add_vline(x=strike, line_width=1.4, line_dash="dash", line_color=PALETTE["muted"])

        demand_values = demand_model.demand_grid(90)
        cost_curve = []
        spot_only_curve = []
        for d in demand_values:
            eval_cost = option_cost_deterministic(float(d), option_qty, strike, premium, spot)
            cost_curve.append(eval_cost["total_cost"])
            spot_only_curve.append(eval_cost["spot_only_cost"])
        fig2 = make_figure("Cost vs Demand", "Demand", "Total Cost")
        fig2.add_trace(
            go.Scatter(x=demand_values, y=cost_curve, mode="lines", name="Option Strategy", line={"color": PALETTE["primary"]})
        )
        fig2.add_trace(
            go.Scatter(
                x=demand_values,
                y=spot_only_curve,
                mode="lines",
                name="Pure Spot Strategy",
                line={"color": PALETTE["secondary"]},
            )
        )
        figures.extend([fig1, fig2])

    elif contract_type == "Quantity Flexibility Contract":
        q0 = params["initial_commitment"]
        adjustment_pct = params["adjustment_pct"]
        wholesale_price = params["w"]
        demand_values = demand_model.demand_grid(100)

        cost_curve = []
        final_curve = []
        lower_curve = []
        upper_curve = []
        for d in demand_values:
            outcome = quantity_flex_deterministic(float(d), q0, adjustment_pct, wholesale_price, costs)
            cost_curve.append(outcome["total_cost"])
            final_curve.append(outcome["final_order"])
            lower_curve.append(outcome["lower"])
            upper_curve.append(outcome["upper"])

        fig1 = make_figure("Total Cost vs Demand", "Demand", "Total Cost")
        fig1.add_trace(
            go.Scatter(x=demand_values, y=cost_curve, mode="lines", name="Total Cost", line={"color": PALETTE["primary"]})
        )

        fig2 = make_figure("Final Order vs Demand", "Demand", "Final Order")
        fig2.add_trace(
            go.Scatter(
                x=demand_values,
                y=final_curve,
                mode="lines",
                name="Final Order",
                line={"color": PALETTE["secondary"], "width": 3},
            )
        )
        fig2.add_trace(
            go.Scatter(
                x=demand_values,
                y=lower_curve,
                mode="lines",
                name="Lower Bound",
                line={"color": PALETTE["muted"], "dash": "dot"},
            )
        )
        fig2.add_trace(
            go.Scatter(
                x=demand_values,
                y=upper_curve,
                mode="lines",
                name="Upper Bound",
                line={"color": PALETTE["accent"], "dash": "dot"},
            )
        )
        figures.extend([fig1, fig2])

    return figures


def render_metric_grid(metrics: dict[str, str], columns: int = 4) -> None:
    if not metrics:
        return
    items = list(metrics.items())
    col_count = min(columns, len(items))
    cols = st.columns(col_count)
    for idx, (label, value) in enumerate(items):
        cols[idx % col_count].metric(label, value)


def render_results(result: dict, is_random: bool) -> None:
    st.markdown("### SECTION 1: Decision Summary")
    render_metric_grid(result.get("decision", {}))
    for note in result.get("summary_notes", []):
        st.info(note)

    st.markdown("### SECTION 2: Financial Results")
    render_metric_grid(result.get("financial", {}))

    st.markdown("### SECTION 3: Risk Metrics")
    risk_metrics = result.get("risk", {})
    if is_random and risk_metrics:
        render_metric_grid(risk_metrics)
    elif is_random:
        st.info("Risk metrics are not available for this configuration.")
    else:
        st.info("Switch Demand Type to Random to view risk metrics.")

    st.markdown("### SECTION 4: Graphical Analysis")
    for fig in result.get("figures", []):
        st.plotly_chart(fig, use_container_width=True)

    advanced = result.get("advanced", {})
    if advanced:
        with st.expander("Advanced Outputs"):
            for key, value in advanced.items():
                st.write(f"**{key}:** {value}")


def contract_wholesale(
    demand_type: str,
    distribution_type: str | None,
    costs: dict[str, float],
) -> dict | None:
    st.markdown("#### Dynamic Input Fields")
    c1, c2, c3 = st.columns(3)
    with c1:
        retail_price = st.number_input("Retail Price", min_value=0.0, value=150.0, step=1.0, key="wh_p")
    with c2:
        wholesale_price = st.number_input("Wholesale Price", min_value=0.0, value=90.0, step=1.0, key="wh_w")
    with c3:
        order_qty = st.number_input("Order Quantity", min_value=0.0, value=100.0, step=1.0, key="wh_q")

    demand_model = demand_handler(demand_type, distribution_type, "wh")
    calculate = st.button("Calculate", type="primary", use_container_width=True, key="calc_wholesale")
    if not calculate:
        return None

    if demand_model is None:
        st.error("Please correct demand inputs before calculation.")
        return None
    if retail_price <= 0.0:
        st.error("Retail price must be greater than zero.")
        return None
    if costs.get("salvage", 0.0) > retail_price:
        st.error("Salvage value cannot exceed retail price.")
        return None

    metrics = demand_model.metrics(order_qty)
    adjust = inventory_adjustment(metrics["expected_leftover"], metrics["expected_unmet"], costs)
    profit = retail_price * metrics["expected_sales"] - wholesale_price * order_qty + adjust["net"]

    optimal_q_display = "N/A"
    fractile_display = "N/A"
    if demand_model.is_random:
        denominator = retail_price - costs.get("salvage", 0.0)
        if denominator > EPS:
            critical_fractile = float(np.clip((retail_price - wholesale_price) / denominator, 0.0, 1.0))
            optimal_q_display = fmt_number(demand_model.ppf(critical_fractile))
            fractile_display = fmt_percent(critical_fractile)
        else:
            st.warning("Optimal quantity is not well-defined with the current salvage and price settings.")

    decision = {
        "Chosen Order Quantity": fmt_number(order_qty),
        "Service Level": fmt_percent(metrics["service_level"]),
        "Expected Leftover": fmt_number(metrics["expected_leftover"]),
    }
    if demand_model.is_random:
        decision["Optimal Order Quantity"] = optimal_q_display

    financial = {
        "Expected Profit" if demand_model.is_random else "Profit": fmt_currency(profit),
        "Expected Sales": fmt_number(metrics["expected_sales"]),
        "Procurement Cost": fmt_currency(wholesale_price * order_qty),
    }

    risk = {}
    if demand_model.is_random:
        risk = {
            "Expected Demand": fmt_number(metrics["expected_demand"]),
            "Stockout Probability": fmt_percent(metrics["stockout_probability"]),
            "Target Service Fractile": fractile_display,
        }

    figures = graph_functions(
        "Wholesale Price Contract",
        demand_model,
        {"p": float(retail_price), "w": float(wholesale_price), "Q": float(order_qty)},
        costs,
    )

    advanced = {
        "Expected Unmet Demand": fmt_number(metrics["expected_unmet"]),
        "Salvage Contribution": fmt_currency(adjust["salvage"]),
        "Holding Cost Impact": fmt_currency(-adjust["holding"]),
        "Shortage & Penalty Impact": fmt_currency(-(adjust["shortage"] + adjust["penalty"])),
    }

    return {
        "decision": decision,
        "financial": financial,
        "risk": risk,
        "figures": figures,
        "advanced": advanced,
    }


def contract_buyback(
    demand_type: str,
    distribution_type: str | None,
    costs: dict[str, float],
) -> dict | None:
    st.markdown("#### Dynamic Input Fields")
    c1, c2, c3 = st.columns(3)
    with c1:
        retail_price = st.number_input("Retail Price", min_value=0.0, value=150.0, step=1.0, key="bb_p")
    with c2:
        wholesale_price = st.number_input("Wholesale Price", min_value=0.0, value=95.0, step=1.0, key="bb_w")
    with c3:
        buyback_price = st.number_input("Buyback Price", min_value=0.0, value=40.0, step=1.0, key="bb_b")

    c4, c5 = st.columns(2)
    with c4:
        order_qty = st.number_input("Order Quantity", min_value=0.0, value=100.0, step=1.0, key="bb_q")
    with c5:
        production_cost = st.number_input(
            "Production Cost per Unit",
            min_value=0.0,
            value=float(wholesale_price),
            step=1.0,
            key="bb_c",
        )

    demand_model = demand_handler(demand_type, distribution_type, "bb")
    calculate = st.button("Calculate", type="primary", use_container_width=True, key="calc_buyback")
    if not calculate:
        return None

    if demand_model is None:
        st.error("Please correct demand inputs before calculation.")
        return None
    if retail_price <= 0.0:
        st.error("Retail price must be greater than zero.")
        return None
    if buyback_price > wholesale_price:
        st.warning("Buyback price exceeds wholesale price. This may create aggressive return incentives.")

    metrics = demand_model.metrics(order_qty)
    adjust = inventory_adjustment(metrics["expected_leftover"], metrics["expected_unmet"], costs)
    retailer_profit = (
        retail_price * metrics["expected_sales"]
        + buyback_price * metrics["expected_leftover"]
        - wholesale_price * order_qty
        + adjust["net"]
    )
    manufacturer_profit = wholesale_price * order_qty - buyback_price * metrics["expected_leftover"]
    total_profit = retail_price * metrics["expected_sales"] - production_cost * order_qty + adjust["net"]

    denominator_retailer = retail_price - buyback_price
    denominator_system = retail_price - costs.get("salvage", 0.0)
    coordination = "Indeterminate"
    if denominator_retailer > EPS and denominator_system > EPS:
        retailer_cf = np.clip((retail_price - wholesale_price) / denominator_retailer, 0.0, 1.0)
        system_cf = np.clip((retail_price - production_cost) / denominator_system, 0.0, 1.0)
        gap = abs(retailer_cf - system_cf)
        if gap <= 0.03:
            coordination = "Coordinated"
        elif gap <= 0.10:
            coordination = "Partially Coordinated"
        else:
            coordination = "Not Coordinated"

    decision = {
        "Order Quantity": fmt_number(order_qty),
        "Coordination Indicator": coordination,
        "Expected Leftover": fmt_number(metrics["expected_leftover"]),
        "Service Level": fmt_percent(metrics["service_level"]),
    }

    financial = {
        "Retailer Profit": fmt_currency(retailer_profit),
        "Manufacturer Profit": fmt_currency(manufacturer_profit),
        "Total Supply Chain Profit": fmt_currency(total_profit),
    }

    risk = {}
    if demand_model.is_random:
        risk = {
            "Expected Demand": fmt_number(metrics["expected_demand"]),
            "Stockout Probability": fmt_percent(metrics["stockout_probability"]),
            "Expected Unmet Demand": fmt_number(metrics["expected_unmet"]),
        }

    figures = graph_functions(
        "Buyback Contract",
        demand_model,
        {
            "p": float(retail_price),
            "w": float(wholesale_price),
            "b": float(buyback_price),
            "Q": float(order_qty),
            "c": float(production_cost),
        },
        costs,
    )

    advanced = {
        "Salvage Contribution": fmt_currency(adjust["salvage"]),
        "Holding Cost Impact": fmt_currency(-adjust["holding"]),
        "Shortage & Penalty Impact": fmt_currency(-(adjust["shortage"] + adjust["penalty"])),
    }

    return {
        "decision": decision,
        "financial": financial,
        "risk": risk,
        "figures": figures,
        "advanced": advanced,
    }


def contract_revenue_sharing(
    demand_type: str,
    distribution_type: str | None,
    costs: dict[str, float],
) -> dict | None:
    st.markdown("#### Dynamic Input Fields")
    c1, c2, c3 = st.columns(3)
    with c1:
        retail_price = st.number_input("Retail Price", min_value=0.0, value=160.0, step=1.0, key="rs_p")
    with c2:
        wholesale_price = st.number_input("Wholesale Price", min_value=0.0, value=80.0, step=1.0, key="rs_w")
    with c3:
        alpha = st.number_input(
            "Revenue Share Ratio",
            min_value=0.0,
            max_value=1.0,
            value=0.30,
            step=0.01,
            key="rs_alpha",
        )
    order_qty = st.number_input("Order Quantity", min_value=0.0, value=100.0, step=1.0, key="rs_q")

    demand_model = demand_handler(demand_type, distribution_type, "rs")
    calculate = st.button("Calculate", type="primary", use_container_width=True, key="calc_revenue")
    if not calculate:
        return None

    if demand_model is None:
        st.error("Please correct demand inputs before calculation.")
        return None
    if retail_price <= 0.0:
        st.error("Retail price must be greater than zero.")
        return None
    if not (0.0 <= alpha <= 1.0):
        st.error("Revenue share ratio must be between 0 and 1.")
        return None

    metrics = demand_model.metrics(order_qty)
    adjust = inventory_adjustment(metrics["expected_leftover"], metrics["expected_unmet"], costs)
    retailer_profit = (1.0 - alpha) * retail_price * metrics["expected_sales"] - wholesale_price * order_qty + adjust["net"]
    supplier_profit = alpha * retail_price * metrics["expected_sales"] + wholesale_price * order_qty
    total_profit = retailer_profit + supplier_profit

    decision = {
        "Order Quantity": fmt_number(order_qty),
        "Revenue Share Ratio": fmt_percent(alpha),
        "Service Level": fmt_percent(metrics["service_level"]),
        "Expected Leftover": fmt_number(metrics["expected_leftover"]),
    }
    financial = {
        "Retailer Profit": fmt_currency(retailer_profit),
        "Supplier Profit": fmt_currency(supplier_profit),
        "Total Profit": fmt_currency(total_profit),
    }

    risk = {}
    if demand_model.is_random:
        risk = {
            "Expected Demand": fmt_number(metrics["expected_demand"]),
            "Stockout Probability": fmt_percent(metrics["stockout_probability"]),
            "Expected Unmet Demand": fmt_number(metrics["expected_unmet"]),
        }

    figures = graph_functions(
        "Revenue Sharing Contract",
        demand_model,
        {"p": float(retail_price), "w": float(wholesale_price), "alpha": float(alpha), "Q": float(order_qty)},
        costs,
    )

    advanced = {
        "Salvage Contribution": fmt_currency(adjust["salvage"]),
        "Holding Cost Impact": fmt_currency(-adjust["holding"]),
        "Shortage & Penalty Impact": fmt_currency(-(adjust["shortage"] + adjust["penalty"])),
    }

    return {
        "decision": decision,
        "financial": financial,
        "risk": risk,
        "figures": figures,
        "advanced": advanced,
    }


def contract_option(
    demand_type: str,
    distribution_type: str | None,
    _costs: dict[str, float],
) -> dict | None:
    st.markdown("#### Dynamic Input Fields")
    c1, c2, c3 = st.columns(3)
    with c1:
        option_qty = st.number_input("Option Quantity", min_value=0.0, value=100.0, step=1.0, key="op_qty")
    with c2:
        strike = st.number_input("Strike Price", min_value=0.0, value=95.0, step=1.0, key="op_strike")
    with c3:
        premium = st.number_input("Reservation Price (Premium)", min_value=0.0, value=12.0, step=0.5, key="op_premium")
    spot = st.number_input("Spot Price", min_value=0.0, value=110.0, step=1.0, key="op_spot")

    demand_model = demand_handler(demand_type, distribution_type, "op")
    calculate = st.button("Calculate", type="primary", use_container_width=True, key="calc_option")
    if not calculate:
        return None

    if demand_model is None:
        st.error("Please correct demand inputs before calculation.")
        return None

    if demand_model.is_random:
        outcome = option_cost_expected(demand_model, option_qty, strike, premium, spot)
        expected_demand = outcome["expected_demand"]
        risk = {
            "Expected Demand": fmt_number(expected_demand),
            "Prob(Demand > Option Qty)": fmt_percent(1.0 - demand_model.cdf(option_qty)),
            "Expected Unhedged Volume": fmt_number(outcome["expected_unhedged"]),
        }
    else:
        deterministic_demand = float(demand_model.params["demand"])
        outcome = option_cost_deterministic(deterministic_demand, option_qty, strike, premium, spot)
        risk = {}

    should_exercise = "YES" if outcome["should_exercise"] > 0.5 else "NO"
    savings = outcome["spot_only_cost"] - outcome["total_cost"]

    decision = {
        "Should Exercise?": should_exercise,
        "Quantity Exercised": fmt_number(outcome["exercised_qty"]),
        "Break-even Spot Price": fmt_currency(strike + premium),
    }
    financial = {
        "Total Cost": fmt_currency(outcome["total_cost"]),
        "Pure Spot Strategy Cost": fmt_currency(outcome["spot_only_cost"]),
        "Cost Advantage vs Spot": fmt_currency(savings),
    }

    figures = graph_functions(
        "Option Contract",
        demand_model,
        {
            "option_qty": float(option_qty),
            "strike": float(strike),
            "premium": float(premium),
            "spot": float(spot),
        },
        _costs,
    )

    advanced = {
        "Exercise Trigger Price": fmt_currency(strike),
        "Total Premium Paid": fmt_currency(option_qty * premium),
        "Current Spot Relative to Trigger": "Above Trigger" if spot > strike else "At/Below Trigger",
    }

    return {
        "decision": decision,
        "financial": financial,
        "risk": risk,
        "figures": figures,
        "advanced": advanced,
        "summary_notes": [
            "Inventory holding, salvage, shortage, and penalty toggles are not applied to option costs in this model."
        ],
    }


def contract_quantity_flexibility(
    demand_type: str,
    distribution_type: str | None,
    costs: dict[str, float],
) -> dict | None:
    st.markdown("#### Dynamic Input Fields")
    c1, c2, c3 = st.columns(3)
    with c1:
        initial_commitment = st.number_input(
            "Initial Order Commitment",
            min_value=0.0,
            value=100.0,
            step=1.0,
            key="qf_initial",
        )
    with c2:
        adjustment_pct = st.number_input(
            "Adjustment Range (%)",
            min_value=0.0,
            max_value=100.0,
            value=20.0,
            step=1.0,
            key="qf_adj",
        )
    with c3:
        wholesale_price = st.number_input("Wholesale Price", min_value=0.0, value=92.0, step=1.0, key="qf_w")

    demand_model = demand_handler(demand_type, distribution_type, "qf")
    calculate = st.button("Calculate", type="primary", use_container_width=True, key="calc_qflex")
    if not calculate:
        return None

    if demand_model is None:
        st.error("Please correct demand inputs before calculation.")
        return None

    if demand_model.is_random:
        outcome = quantity_flex_expected(demand_model, initial_commitment, adjustment_pct, wholesale_price, costs)
        risk = {
            "Expected Demand": fmt_number(outcome["expected_demand"]),
            "Prob(Demand > Upper Band)": fmt_percent(1.0 - demand_model.cdf(outcome["upper"])),
            "Prob(Demand < Lower Band)": fmt_percent(demand_model.cdf(outcome["lower"])),
        }
        final_label = "Expected Final Order"
    else:
        deterministic_demand = float(demand_model.params["demand"])
        outcome = quantity_flex_deterministic(
            deterministic_demand,
            initial_commitment,
            adjustment_pct,
            wholesale_price,
            costs,
        )
        risk = {}
        final_label = "Final Order Quantity"

    decision = {
        final_label: fmt_number(outcome["final_order"]),
        "Lower Flex Bound": fmt_number(outcome["lower"]),
        "Upper Flex Bound": fmt_number(outcome["upper"]),
        "Service Level": fmt_percent(outcome["service_level"]),
    }
    financial = {
        "Total Procurement Cost": fmt_currency(outcome["procurement_cost"]),
        "Total Cost": fmt_currency(outcome["total_cost"]),
        "Unmet Demand": fmt_number(outcome["unmet"]),
        "Overstock": fmt_number(outcome["overstock"]),
    }

    figures = graph_functions(
        "Quantity Flexibility Contract",
        demand_model,
        {
            "initial_commitment": float(initial_commitment),
            "adjustment_pct": float(adjustment_pct),
            "w": float(wholesale_price),
        },
        costs,
    )

    advanced = {
        "Holding Cost Impact": fmt_currency(-costs.get("holding", 0.0) * outcome["overstock"]),
        "Shortage & Penalty Impact": fmt_currency(
            -(costs.get("shortage", 0.0) + costs.get("penalty", 0.0)) * outcome["unmet"]
        ),
        "Salvage Offset": fmt_currency(costs.get("salvage", 0.0) * outcome["overstock"]),
    }

    return {
        "decision": decision,
        "financial": financial,
        "risk": risk,
        "figures": figures,
        "advanced": advanced,
    }


def build_sidebar() -> tuple[str, str, str | None, dict[str, float]]:
    with st.sidebar:
        st.header("Navigation")
        contract_type = st.selectbox(
            "Contract Type",
            [
                "Wholesale Price Contract",
                "Buyback Contract",
                "Revenue Sharing Contract",
                "Option Contract",
                "Quantity Flexibility Contract",
            ],
        )
        demand_type = st.radio("Demand Type", ["Deterministic", "Random"])

        distribution_type = None
        if demand_type == "Random":
            distribution_type = st.selectbox(
                "Distribution",
                ["Normal Distribution", "Uniform Distribution", "Discrete Distribution"],
            )

        st.markdown("### Advanced Cost Components")
        costs = {"salvage": 0.0, "holding": 0.0, "shortage": 0.0, "penalty": 0.0}
        include_salvage = st.checkbox("Include Salvage Value", value=False)
        include_holding = st.checkbox("Include Holding Cost", value=False)
        include_shortage = st.checkbox("Include Shortage Cost", value=False)
        include_penalty = st.checkbox("Include Penalty Cost", value=False)

        if include_salvage:
            costs["salvage"] = float(
                st.number_input("Salvage Value (per unit)", min_value=0.0, value=10.0, step=0.5, key="cost_salvage")
            )
        if include_holding:
            costs["holding"] = float(
                st.number_input("Holding Cost (per unit)", min_value=0.0, value=2.0, step=0.5, key="cost_holding")
            )
        if include_shortage:
            costs["shortage"] = float(
                st.number_input("Shortage Cost (per unit)", min_value=0.0, value=5.0, step=0.5, key="cost_shortage")
            )
        if include_penalty:
            costs["penalty"] = float(
                st.number_input("Penalty Cost (per unit)", min_value=0.0, value=3.0, step=0.5, key="cost_penalty")
            )

    return contract_type, demand_type, distribution_type, costs


def main() -> None:
    apply_dark_theme()
    contract_type, demand_type, distribution_type, costs = build_sidebar()

    st.title("Supply Chain Contract Decision Lab")
    st.markdown(
        f'<div class="contract-card"><strong>Contract Description</strong><br>{CONTRACT_DESCRIPTIONS[contract_type]}</div>',
        unsafe_allow_html=True,
    )

    result = None
    if contract_type == "Wholesale Price Contract":
        result = contract_wholesale(demand_type, distribution_type, costs)
    elif contract_type == "Buyback Contract":
        result = contract_buyback(demand_type, distribution_type, costs)
    elif contract_type == "Revenue Sharing Contract":
        result = contract_revenue_sharing(demand_type, distribution_type, costs)
    elif contract_type == "Option Contract":
        result = contract_option(demand_type, distribution_type, costs)
    elif contract_type == "Quantity Flexibility Contract":
        result = contract_quantity_flexibility(demand_type, distribution_type, costs)

    if result is not None:
        render_results(result, is_random=(demand_type == "Random"))


if __name__ == "__main__":
    main()
