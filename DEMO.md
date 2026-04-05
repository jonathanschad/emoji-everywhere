# Emoji Everywhere -- Test Page

Use this page to verify that the **Emoji Everywhere** browser extension is
replacing `:custom_emoji:` patterns with actual images.

If the extension is active and you have emojis loaded from a Slack workspace
or ZIP import, the colon-wrapped names below should render as images instead
of plain text.

---

## Inline usage

Hey team :wave:, the deploy is done :shipit: -- let's celebrate :tada:!

Great job on the review :thumbsup: :thumbsup_all: :partyparrot:

This PR is :fire: :100: :rocket:

---

## Common custom emojis

| Pattern | Should render? |
|---|---|
| :thumbsup: | yes, if loaded |
| :thumbsdown: | yes, if loaded |
| :party_parrot: | yes, if loaded |
| :partyparrot: | yes, if loaded |
| :shipit: | yes, if loaded |
| :troll: | yes, if loaded |
| :doge: | yes, if loaded |
| :this-is-fine: | yes, if loaded |
| :harold: | yes, if loaded |
| :facepalm: | yes, if loaded |
| :catjam: | yes, if loaded |
| :blobwave: | yes, if loaded |
| :meow_party: | yes, if loaded |
| :nyan_cat: | yes, if loaded |
| :lgtm: | yes, if loaded |

---

## Edge cases

### Multiple emojis in a row

:rocket::rocket::rocket: launch time!

### Emojis with hyphens and underscores

:this-is-fine: :not_bad: :feels-good-man: :big_thumbs_up:

### Emoji surrounded by punctuation

Have you seen :doge:? It's (:fire:) absolutely :100:!

### Emoji at the start and end of a line

:wave: Hello world :wave:

### Emoji in bold and italic text

**:fire: Hot take** and *:eyes: interesting*

### Emoji in list items

- :white_check_mark: Tests passing
- :x: Build failed
- :hourglass: Waiting for review
- :tada: Merged!

### Emoji in blockquotes

> :mega: Reminder: deploy window is 2-4pm :clock2:

### Not an emoji (should stay as text)

These should **not** be replaced because they appear inside code:

- Inline code: `:shipit:`
- Code block:

```
:partyparrot: this should remain text
```

---

## Stress test -- many emojis in one paragraph

:wave: :thumbsup: :tada: :fire: :rocket: :100: :eyes: :shipit: :doge:
:partyparrot: :catjam: :lgtm: :blobwave: :meow_party: :nyan_cat: :harold:
:facepalm: :troll: :this-is-fine: :party_parrot: :thumbsdown: :mega:
:white_check_mark: :x: :hourglass: :clock2: :feels-good-man: :big_thumbs_up:
:not_bad: :cool-doge: :blob-dance: :party-blob:

---

*If any of the above names match emojis you've loaded into the extension,
they should appear as images. Names that don't match any loaded emoji will
remain as plain `:text:`.*
