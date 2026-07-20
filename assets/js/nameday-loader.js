document.addEventListener("DOMContentLoaded", function () {
    const namedayPills = document.querySelectorAll(".menu-nameday-pill");
    const calendarCache = {};
    const timeZone = "Europe/Athens";
    const isCompactNameday = window.matchMedia("(max-width: 767px)").matches;
    const maxVisibleNames = isCompactNameday ? 2 : 3;

    if (!namedayPills.length) return;

    function getAthensParts(date) {
        const parts = new Intl.DateTimeFormat("en-CA", {
            timeZone,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
        }).formatToParts(date);

        return {
            year: Number(parts.find((part) => part.type === "year").value),
            month: Number(parts.find((part) => part.type === "month").value),
            day: Number(parts.find((part) => part.type === "day").value),
        };
    }

    function getAthensDate(offsetDays) {
        const today = getAthensParts(new Date());
        const target = new Date(Date.UTC(today.year, today.month - 1, today.day + offsetDays, 12));

        return getAthensParts(target);
    }

    function formatCalendarKey(parts) {
        return String(parts.year) +
            String(parts.month).padStart(2, "0") +
            String(parts.day).padStart(2, "0");
    }

    function unfoldIcs(text) {
        return text.replace(/\r?\n[ \t]/g, "");
    }

    function unescapeIcs(value) {
        return value
            .replace(/\\n/gi, " ")
            .replace(/\\,/g, ",")
            .replace(/\\;/g, ";")
            .replace(/\\\\/g, "\\")
            .trim();
    }

    function normalizeName(value) {
        return value
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^\p{L}\p{N}]+/gu, " ")
            .trim()
            .toLocaleLowerCase("el-GR");
    }

    function hasDiacritics(value) {
        return /[\u0300-\u036f]/.test(value.normalize("NFD"));
    }

    function tidyName(value) {
        return value
            .replace(/\([^)]*\)/g, "")
            .replace(/\s*\*+\s*/g, "")
            .replace(/\s+\(\d+\)\s*/g, " ")
            .replace(/[()]/g, " ")
            .replace(/\s+/g, " ")
            .trim();
    }

    function getDisplayNames(summary) {
        const withoutSource = unescapeIcs(summary).trim();

        if (
            !withoutSource ||
            /δεν υπάρχει|παρακαλούμε|καλή χρονιά/i.test(withoutSource)
        ) {
            return [];
        }

        const parentheticalGroups = Array.from(withoutSource.matchAll(/\(([^()]*)\)/g))
            .map(function (match) { return match[1].trim(); })
            .filter(function (group) { return group && !/^\*+$/.test(group); });
        const source = parentheticalGroups.length
            ? parentheticalGroups[parentheticalGroups.length - 1]
            : withoutSource;
        const seen = new Map();

        source.split(/[,;]/).forEach(function (name) {
            const cleanName = tidyName(name);
            const key = normalizeName(cleanName);

            const existingName = seen.get(key);

            if (!cleanName || !key) return;
            if (!existingName || (hasDiacritics(cleanName) && !hasDiacritics(existingName))) {
                seen.set(key, cleanName);
            }
        });

        return Array.from(seen.values());
    }

    function parseCalendar(text) {
        const events = {};
        const blocks = unfoldIcs(text).split("BEGIN:VEVENT");

        blocks.forEach(function (block) {
            const dateMatch = block.match(/DTSTART(?:;[^:]*)?:(\d{8})/);
            const summaryMatch = block.match(/SUMMARY(?:;[^:]*)?:(.+)/);

            if (!dateMatch || !summaryMatch) return;

            const names = getDisplayNames(summaryMatch[1]);
            if (!names.length) return;

            const dateKey = dateMatch[1];
            events[dateKey] = events[dateKey] || [];
            events[dateKey].push(...names);
        });

        Object.keys(events).forEach(function (dateKey) {
            const seen = new Map();

            events[dateKey].forEach(function (name) {
                const key = normalizeName(name);
                const existingName = seen.get(key);

                if (!existingName || (hasDiacritics(name) && !hasDiacritics(existingName))) {
                    seen.set(key, name);
                }
            });

            events[dateKey] = Array.from(seen.values());
        });

        return events;
    }

    function loadCalendar(year) {
        if (!calendarCache[year]) {
            calendarCache[year] = fetch(`assets/data/eortologio-${year}.ics?v=20260603`)
                .then(function (response) {
                    if (!response.ok) throw new Error("Nameday calendar request failed");
                    return response.text();
                })
                .then(parseCalendar);
        }

        return calendarCache[year];
    }

    function formatNames(names, maxCount) {
        if (!names || !names.length) return "Δεν υπάρχει γνωστή γιορτή";

        const visibleNames = names.slice(0, maxCount);

        return visibleNames.join(", ") + (visibleNames.length < names.length ? ", κ.ά." : "");
    }

    function renderNamedays(todayNames, tomorrowNames) {
        const todayText = formatNames(todayNames, maxVisibleNames);
        const tomorrowText = formatNames(tomorrowNames, maxVisibleNames);
        const label = `Σήμερα: ${todayText} | Αύριο: ${tomorrowText}`;

        namedayPills.forEach(function (pill) {
            const todayEl = pill.querySelector(".menu-nameday-today");
            const tomorrowEl = pill.querySelector(".menu-nameday-tomorrow");

            if (todayEl) todayEl.textContent = `Σήμερα: ${todayText}`;
            if (tomorrowEl) tomorrowEl.textContent = `Αύριο: ${tomorrowText}`;

            pill.setAttribute("title", label);
            pill.setAttribute("aria-label", label);
        });
    }

    function renderFallback() {
        const label = "Εορτολόγιο: προσωρινά μη διαθέσιμο";

        namedayPills.forEach(function (pill) {
            const todayEl = pill.querySelector(".menu-nameday-today");
            const tomorrowEl = pill.querySelector(".menu-nameday-tomorrow");

            if (todayEl) todayEl.textContent = "Σήμερα: Εορτολόγιο";
            if (tomorrowEl) tomorrowEl.textContent = "Αύριο: μη διαθέσιμο";

            pill.setAttribute("title", label);
            pill.setAttribute("aria-label", label);
        });
    }

    const today = getAthensDate(0);
    const tomorrow = getAthensDate(1);
    const years = Array.from(new Set([today.year, tomorrow.year]));

    Promise.all(years.map(loadCalendar))
        .then(function (calendars) {
            const byYear = {};

            years.forEach(function (year, index) {
                byYear[year] = calendars[index];
            });

            renderNamedays(
                byYear[today.year][formatCalendarKey(today)] || [],
                byYear[tomorrow.year][formatCalendarKey(tomorrow)] || []
            );
        })
        .catch(renderFallback);
});
