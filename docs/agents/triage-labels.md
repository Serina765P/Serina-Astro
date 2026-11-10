# Triage Labels

Five canonical triage roles for GitHub issues in this repo. The label strings
equal the role names; they describe issues, not Trellis task states.

| Label | Meaning |
| --- | --- |
| `needs-triage` | Maintainer needs to evaluate this issue |
| `needs-info` | Waiting on reporter for more information |
| `ready-for-agent` | Fully specified, ready for an AFK agent |
| `ready-for-human` | Requires human implementation |
| `wontfix` | Will not be actioned |

## Creating the labels

The labels don't exist in `Serina765P/Serina-Astro` yet. Create them the first
time an issue is triaged, or on demand:

```bash
gh label create needs-triage    --color E4E669 --description "Maintainer needs to evaluate this issue"
gh label create needs-info      --color D876E3 --description "Waiting on reporter for more information"
gh label create ready-for-agent --color 0E8A16 --description "Fully specified, ready for an AFK agent"
gh label create ready-for-human --color 1D76DB --description "Requires human implementation"
gh label create wontfix         --color FFFFFF --description "Will not be actioned"
```

Trellis tasks created from a fully specified issue skip triage; triage exists
for incoming issues.
