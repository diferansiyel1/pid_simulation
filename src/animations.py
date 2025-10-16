from __future__ import annotations

from math import exp
from typing import Callable

from manim import (
    DOWN,
    LEFT,
    RIGHT,
    UP,
    Axes,
    DashedLine,
    Dot,
    FadeIn,
    FadeOut,
    Group,
    Line,
    Rectangle,
    Scene,
    SurroundingRectangle,
    Tex,
    VGroup,
    Write,
    always_redraw,
    linear,
    rate_functions,
    ValueTracker,
)


def create_block(label: str, width: float = 2.4, height: float = 1.2):
    box = Rectangle(width=width, height=height)
    text = Tex(label, font_size=32)
    grp = VGroup(box, text)
    text.move_to(box.get_center())
    return grp


def arrow_between(mob1, mob2):
    from manim import Arrow

    return Arrow(mob1.get_right(), mob2.get_left(), buff=0.15)


def feedback_loop_diagram():
    sp = create_block("Setpoint $r$")
    summ = create_block("Comparator $e=r-y$")
    ctrl = create_block("Controller $u$")
    act = create_block("Actuator")
    proc = create_block("Process")
    sens = create_block("Sensor $y$")

    sp.shift(4 * LEFT)
    summ.next_to(sp, RIGHT, buff=0.6)
    ctrl.next_to(summ, RIGHT, buff=0.6)
    act.next_to(ctrl, RIGHT, buff=0.6)
    proc.next_to(act, RIGHT, buff=0.6)
    sens.next_to(proc, DOWN, buff=1.0)

    fwd_arrows = VGroup(
        arrow_between(sp, summ),
        arrow_between(summ, ctrl),
        arrow_between(ctrl, act),
        arrow_between(act, proc),
    )

    from manim import Arrow

    fb_down = Arrow(proc.get_bottom(), sens.get_top(), buff=0.15)
    fb_left = Arrow(sens.get_left(), summ.get_bottom() + 1.2 * DOWN, buff=0.15)
    fb_up = Arrow(summ.get_bottom() + 1.2 * DOWN, summ.get_bottom(), buff=0.1)

    labels = VGroup(
        Tex("$r$", font_size=28).next_to(fwd_arrows[0], UP, buff=0.1),
        Tex("$e$", font_size=28).next_to(fwd_arrows[1], UP, buff=0.1),
        Tex("$u$", font_size=28).next_to(fwd_arrows[2], UP, buff=0.1),
        Tex("$y$", font_size=28).next_to(fwd_arrows[3], UP, buff=0.1),
        Tex("feedback $y$", font_size=24).next_to(fb_down, RIGHT, buff=0.1),
    )

    diagram = VGroup(sp, summ, ctrl, act, proc, sens, fwd_arrows, fb_down, fb_left, fb_up, labels)
    return diagram


class NegativeFeedbackScene(Scene):
    def construct(self):
        title = Tex("Negative Feedback Loop", font_size=42).to_edge(UP)
        self.play(Write(title))

        diagram = feedback_loop_diagram()
        self.play(FadeIn(diagram))

        # Time response axes
        axes = Axes(x_range=[0, 10, 2], y_range=[-0.2, 1.2, 0.2], tips=False, x_length=6, y_length=2)
        axes.to_corner(DOWN + RIGHT)
        x_label = Tex("time", font_size=24).next_to(axes.x_axis, DOWN, buff=0.2)
        y_label = Tex("normalized output $y$", font_size=24).next_to(axes.y_axis, LEFT, buff=0.2)
        self.play(FadeIn(axes), FadeIn(x_label), FadeIn(y_label))

        step_time = 1.0
        t = ValueTracker(0.0)

        def y_of_t(tt: float) -> float:
            # First-order response to step at t=1s
            if tt < step_time:
                return 0.0
            return 1.0 - exp(-(tt - step_time) / 1.5)

        graph = always_redraw(
            lambda: axes.plot(lambda x: y_of_t(min(x, t.get_value())), x_range=[0, t.get_value()], color="#3B82F6")
        )

        sp_line = always_redraw(
            lambda: axes.get_graph(lambda x: 1.0 if x >= step_time else 0.0, x_range=[0, t.get_value()], color="#22C55E")
        )

        self.play(FadeIn(graph), FadeIn(sp_line))

        note = Tex(
            "Setpoint step $r$ and output $y$ converge via negative feedback",
            font_size=28,
        ).next_to(axes, UP, buff=0.3)
        self.play(Write(note))

        self.play(t.animate.set_value(10), run_time=8, rate_func=linear)
        self.wait(1)


class PIDScene(Scene):
    def construct(self):
        title = Tex("PID Control: P, I, D Effects", font_size=42).to_edge(UP)
        self.play(Write(title))

        # Axes for error/response
        axes = Axes(x_range=[0, 10, 2], y_range=[-0.2, 1.4, 0.2], tips=False, x_length=10, y_length=3)
        axes.to_edge(DOWN)
        self.play(FadeIn(axes))

        t = ValueTracker(0.0)
        step_time = 0.8

        # Error signal: step to 1 at t=0.8, with small noise ripple
        def e_of_t(tt: float) -> float:
            if tt < step_time:
                return 0.0
            return 1.0

        # P term ~ Kp * e
        Kp = 0.8
        # I term integrates error
        Ki = 0.5
        # D term on error derivative
        Kd = 0.25

        def p_term(tt: float) -> float:
            return Kp * e_of_t(tt)

        def i_term(tt: float) -> float:
            # simple capped integral for visualization
            if tt < step_time:
                return 0.0
            return min(Ki * (tt - step_time), 0.9)

        def d_term(tt: float) -> float:
            # approximate impulse-like derivative at step, then decay
            if tt < step_time:
                return 0.0
            return Kd * exp(-(tt - step_time) / 0.3)

        def u_of_t(tt: float) -> float:
            return p_term(tt) + i_term(tt) + d_term(tt)

        p_graph = always_redraw(
            lambda: axes.plot(lambda x: p_term(min(x, t.get_value())), x_range=[0, t.get_value()], color="#EF4444")
        )
        i_graph = always_redraw(
            lambda: axes.plot(lambda x: i_term(min(x, t.get_value())), x_range=[0, t.get_value()], color="#22C55E")
        )
        d_graph = always_redraw(
            lambda: axes.plot(lambda x: d_term(min(x, t.get_value())), x_range=[0, t.get_value()], color="#A855F7")
        )
        u_graph = always_redraw(
            lambda: axes.plot(lambda x: u_of_t(min(x, t.get_value())), x_range=[0, t.get_value()], color="#3B82F6")
        )

        legend = VGroup(
            Tex("P (red)", font_size=28),
            Tex("I (green)", font_size=28),
            Tex("D (purple)", font_size=28),
            Tex("u = P+I+D (blue)", font_size=28),
        ).arrange(RIGHT, buff=0.6).to_edge(UP).shift(0.8 * DOWN)

        self.play(FadeIn(p_graph), FadeIn(i_graph), FadeIn(d_graph), FadeIn(u_graph), FadeIn(legend))

        captions = [
            "P: instant proportional response to error",
            "I: accumulates error for steady-state removal",
            "D: responds to change rate, damps oscillations",
        ]
        for c in captions:
            cap = Tex(c, font_size=30).to_corner(UP + LEFT).shift(0.6 * DOWN)
            self.play(Write(cap))
            self.play(t.animate.set_value(min(t.get_value() + 3.3, 10)), run_time=3.3, rate_func=linear)
            self.play(FadeOut(cap))

        self.play(t.animate.set_value(10), run_time=1.5, rate_func=linear)
        self.wait(1)


class CascadeControlScene(Scene):
    def construct(self):
        title = Tex("Cascade Control", font_size=42).to_edge(UP)
        self.play(Write(title))

        # Outer loop (slow): master controller -> setpoint for inner loop
        outer_ref = create_block("Master SP $r_1$")
        outer_ctrl = create_block("Outer Ctrl")
        inner_ref = create_block("Inner SP $r_2$")
        outer_ref.shift(5 * LEFT + 1.2 * UP)
        outer_ctrl.next_to(outer_ref, RIGHT, buff=0.6)
        inner_ref.next_to(outer_ctrl, RIGHT, buff=0.6)

        inner_ctrl = create_block("Inner Ctrl")
        act = create_block("Actuator")
        proc = create_block("Process")
        sensor_fast = create_block("Fast Sensor $y_2$")
        sensor_slow = create_block("Slow Sensor $y_1$")

        inner_ctrl.shift(1.0 * DOWN)
        inner_ctrl.next_to(inner_ref, DOWN, buff=1.1)
        act.next_to(inner_ctrl, RIGHT, buff=0.6)
        proc.next_to(act, RIGHT, buff=0.6)
        sensor_fast.next_to(proc, DOWN, buff=0.8)
        sensor_slow.next_to(proc, UP, buff=0.8)

        from manim import Arrow

        fwd = VGroup(
            arrow_between(outer_ref, outer_ctrl),
            arrow_between(outer_ctrl, inner_ref),
            Arrow(inner_ref.get_bottom(), inner_ctrl.get_top(), buff=0.1),
            arrow_between(inner_ctrl, act),
            arrow_between(act, proc),
        )

        fb_fast = VGroup(
            Arrow(proc.get_bottom(), sensor_fast.get_top(), buff=0.1),
            Arrow(sensor_fast.get_left(), inner_ctrl.get_right() + 0.8 * RIGHT, buff=0.1),
            Arrow(inner_ctrl.get_right() + 0.8 * RIGHT, inner_ctrl.get_right(), buff=0.1),
        )

        fb_slow = VGroup(
            Arrow(proc.get_top(), sensor_slow.get_bottom(), buff=0.1),
            Arrow(sensor_slow.get_left(), outer_ctrl.get_bottom() + 1.0 * DOWN, buff=0.1),
            Arrow(outer_ctrl.get_bottom() + 1.0 * DOWN, outer_ctrl.get_bottom(), buff=0.1),
        )

        self.play(FadeIn(outer_ref, outer_ctrl, inner_ref, inner_ctrl, act, proc, sensor_fast, sensor_slow))
        self.play(Write(fwd), Write(fb_fast), Write(fb_slow))

        # Disturbance visualization on inner loop response (fast correction)
        axes = Axes(x_range=[0, 10, 2], y_range=[-0.2, 1.2, 0.2], tips=False, x_length=6, y_length=2)
        axes.to_corner(DOWN + RIGHT)
        self.play(FadeIn(axes))

        t = ValueTracker(0.0)
        d_time = 3.0
        slow_tau = 2.5
        fast_tau = 0.6

        def y2_of_t(tt: float) -> float:
            # inner variable: quick recovery from disturbance at t=3
            base = 1.0
            if tt < d_time:
                return base
            return base - 0.5 * exp(-(tt - d_time) / fast_tau)

        def y1_of_t(tt: float) -> float:
            # outer variable follows inner setpoint more slowly
            return 1.0 - 0.4 * exp(-tt / slow_tau)

        y2 = always_redraw(lambda: axes.plot(lambda x: y2_of_t(min(x, t.get_value())), x_range=[0, t.get_value()], color="#F59E0B"))
        y1 = always_redraw(lambda: axes.plot(lambda x: y1_of_t(min(x, t.get_value())), x_range=[0, t.get_value()], color="#3B82F6"))
        legend = VGroup(Tex("Inner $y_2$ (fast)", font_size=26), Tex("Outer $y_1$ (slow)", font_size=26)).arrange(RIGHT, buff=0.6).next_to(axes, UP)
        self.play(FadeIn(y2), FadeIn(y1), FadeIn(legend))
        self.play(t.animate.set_value(10), run_time=8, rate_func=linear)
        self.wait(1)


class FeedforwardControlScene(Scene):
    def construct(self):
        title = Tex("Feedforward Control", font_size=42).to_edge(UP)
        self.play(Write(title))

        # Blocks: Disturbance measurement, model, controller, process
        meas = create_block("Disturbance $d$ sensor")
        model = create_block("Process model $G^{-1}$")
        sum_u = create_block("Sum $u = u_{fb}+u_{ff}$")
        proc = create_block("Process")
        sensor = create_block("Sensor $y$")
        fb_ctrl = create_block("Feedback Ctrl")
        sp = create_block("Setpoint $r$")

        sp.shift(5 * LEFT)
        fb_ctrl.next_to(sp, RIGHT, buff=0.6)
        sum_u.next_to(fb_ctrl, RIGHT, buff=0.6)
        proc.next_to(sum_u, RIGHT, buff=0.6)
        sensor.next_to(proc, DOWN, buff=0.8)
        meas.next_to(sum_u, UP, buff=1.2)
        model.next_to(meas, RIGHT, buff=0.6)

        from manim import Arrow

        fwd_fb = VGroup(
            arrow_between(sp, fb_ctrl),
            arrow_between(fb_ctrl, sum_u),
            arrow_between(sum_u, proc),
        )
        fb_loop = VGroup(
            Arrow(proc.get_bottom(), sensor.get_top(), buff=0.1),
            Arrow(sensor.get_left(), fb_ctrl.get_bottom() + 1.0 * DOWN, buff=0.1),
            Arrow(fb_ctrl.get_bottom() + 1.0 * DOWN, fb_ctrl.get_bottom(), buff=0.1),
        )
        ff_path = VGroup(
            Arrow(meas.get_right(), model.get_left(), buff=0.1),
            Arrow(model.get_right(), sum_u.get_top(), buff=0.1),
        )

        self.play(FadeIn(sp, fb_ctrl, sum_u, proc, sensor, meas, model))
        self.play(Write(fwd_fb), Write(fb_loop), Write(ff_path))

        # Response axes
        axes = Axes(x_range=[0, 10, 2], y_range=[-0.2, 1.2, 0.2], tips=False, x_length=6, y_length=2)
        axes.to_corner(DOWN + RIGHT)
        self.play(FadeIn(axes))

        t = ValueTracker(0.0)
        d_time = 2.0

        def y_fb(tt: float) -> float:
            # feedback only: disturbance enters, output deviates then recovers
            if tt < d_time:
                return 1.0
            return 1.0 - 0.4 * exp(-(tt - d_time) / 1.2)

        def y_ff(tt: float) -> float:
            # feedforward cancels most deviation immediately
            if tt < d_time:
                return 1.0
            return 1.0 - 0.1 * exp(-(tt - d_time) / 0.3)

        y_fb_graph = always_redraw(lambda: axes.plot(lambda x: y_fb(min(x, t.get_value())), x_range=[0, t.get_value()], color="#EF4444"))
        y_ff_graph = always_redraw(lambda: axes.plot(lambda x: y_ff(min(x, t.get_value())), x_range=[0, t.get_value()], color="#22C55E"))
        legend = VGroup(Tex("Feedback only", font_size=26), Tex("With feedforward", font_size=26)).arrange(RIGHT, buff=0.6).next_to(axes, UP)
        self.play(FadeIn(y_fb_graph), FadeIn(y_ff_graph), FadeIn(legend))
        self.play(t.animate.set_value(10), run_time=7, rate_func=linear)
        self.wait(1)


__all__ = [
    "NegativeFeedbackScene",
    "PIDScene",
    "CascadeControlScene",
    "FeedforwardControlScene",
]


