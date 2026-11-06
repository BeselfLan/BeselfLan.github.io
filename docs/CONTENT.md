# Adding content

All site content lives in `packages/content` and is checked by zod and by
`packages/content/src/content.test.ts`. This page covers adding a project. The
example uses the invented id `my-project`.

## Add a project

1. **Data object.** Add an entry to `packages/content/src/data/projects.ts`
   with the id `my-project`.
   - Every id in `tech` must exist in `packages/content/src/data/skills.ts`.
   - A featured entry needs 3 to 5 bullets and a known start date.
   - Add the matching row to `INVENTORY` in
     `packages/content/src/content.test.ts`. The test that compares the entry
     list to `INVENTORY` fails until you do, so the steps do not work without
     this line.
2. **Icon.** Add `apps/web/public/icons/entries/my-project.svg`. It is
   required for featured entries. The test that checks it is skipped until
   that folder holds its first SVG, and enforces it from then on.
3. **Optional video.** `scripts/media/convert.sh` is not in the repo yet; issue
   #12 adds it. Until then, leave `media` out of the entry.
4. **Run the tests.** `npm run check`.
