# Demo recordings

## `beanstalk.cast`

Asciinema recording reconstructed from the actual scan-run log of solhunt against the Beanstalk Diamond proxy (`0xC1E088fC1323b20BCBee9bd1B9fC9546db5624C5`) on 2026-04-15. The original run produced a passing forge exploit test in 1m44s and cost $0.65 in OpenRouter API fees.

**What's reconstructed vs literal:**

- **Iteration sequence, tool calls, error states, and final report** — taken verbatim from the recorded scan log + structured report JSON. See [docs/CASE_STUDY_BEANSTALK.md](../CASE_STUDY_BEANSTALK.md) for the iteration-by-iteration narrative this is based on.
- **Timing** — paced to match the recorded total (1m44s) but exact per-iteration delays are interpolated from per-iteration token counts in the log, not literal stopwatch values.
- **Color codes and shell prompt formatting** — added for readability; the actual run produces plain text.

The `.cast` is published rather than the original session log because asciinema is the standard portable format and the original log contains internal Supabase IDs.

## Playback

```bash
# install asciinema (Mac):  brew install asciinema
# install asciinema (Linux): pipx install asciinema

asciinema play beanstalk.cast
```

Or paste into [asciinema.org/a/](https://asciinema.org/) — it's the standard `.cast` format.

## Recording a fresh cast

```bash
# inside solhunt repo with claude CLI authed:
asciinema rec docs/demos/<contract-name>.cast --idle-time-limit 2 --command \
  "npx tsx src/index.ts scan 0x<address> --via-claude-cli"
```

`--idle-time-limit 2` collapses long quiet stretches in the recording so the playback stays watchable.
