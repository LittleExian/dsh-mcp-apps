# Visual specification

## Product context

The animation explains the repository's MCP Apps Host for DeepSeek Harness and the included GitHub Trending MCP App example. It is a technical explainer, not an official DeepSeek or GitHub brand film.

## Source assets

- Real desktop UI capture: `../images/github-trending-desktop.png`
- Real mobile UI capture: `../images/github-trending-mobile.png`
- Real DSH recording: `dsh-github-trending.webm`
- Real WiseWork recording: `wisework-dts-test.gif`
- Architecture and terminology: `../architecture.md`, repository source under `src/`, example source under `examples/github-trending/`

## Palette

- Paper: `#F2EEE4`
- Ink: `#18241F`
- Host green: `#217A55`
- Capability orange: `#EF8D32`
- Active trace blue: `#1657D8`
- Rule gray: `#B8B5AA`

## Type

- Display: Georgia, Songti SC, serif
- Body: PingFang SC, Noto Sans SC, sans-serif
- Protocol trace: SFMono-Regular, Menlo, monospace

## Rules

- Use the real UI capture when the App becomes the subject.
- Keep one topic per page and replay its animation whenever the page is opened.
- Blue only marks the currently executing bridge/RPC path.
- Place the two real recordings at the end of the deck.
- Never display credentials, API keys, or invented production metrics.
- MCP, DSH, AppBridge, tool and method names remain exact.
