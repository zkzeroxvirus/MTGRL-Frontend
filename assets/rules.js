const ruleSearchInput = document.querySelector("[data-rule-search]");
const ruleSearchStatus = document.querySelector("[data-search-status]");
const ruleSections = Array.from(document.querySelectorAll(".rules-section"));
const tocLinks = Array.from(document.querySelectorAll(".toc a"));

if (ruleSearchInput && ruleSearchStatus && ruleSections.length) {
  const tocLinkMap = new Map(
    tocLinks.map((link) => [link.getAttribute("href"), link]),
  );

  const indexedSections = ruleSections.map((section) => ({
    section,
    anchor: `#${section.id}`,
    text: section.textContent.replace(/\s+/g, " ").trim().toLowerCase(),
  }));

  const formatCount = (count) => `${count} section${count === 1 ? "" : "s"}`;

  const updateRuleSearch = () => {
    const rawQuery = ruleSearchInput.value.trim();
    const query = rawQuery.toLowerCase();
    let visibleCount = 0;

    indexedSections.forEach(({ section, anchor, text }) => {
      const matches = !query || text.includes(query);
      section.hidden = !matches;

      if (matches) {
        visibleCount += 1;
      }

      const tocLink = tocLinkMap.get(anchor);
      if (tocLink) {
        tocLink.classList.toggle("is-hidden", !matches);
      }
    });

    ruleSearchStatus.textContent = rawQuery
      ? `Showing ${formatCount(visibleCount)} matching "${rawQuery}".`
      : `Showing all ${formatCount(indexedSections.length)}.`;
  };

  ruleSearchInput.addEventListener("input", updateRuleSearch);
  updateRuleSearch();
}
