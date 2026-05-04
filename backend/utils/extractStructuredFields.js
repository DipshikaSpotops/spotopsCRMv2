/**
 * Extract structured fields from lead-form email HTML (shared by gmail controller + inbound stats).
 */
export function extractStructuredFields(html) {
  if (!html) return {};

  const fields = {};

  let textContent = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  textContent = textContent
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  textContent = textContent.replace(/@media[^}]*}/g, "");

  const patterns = {
    name: /(?:Name|Full Name|Customer Name)[\s:]+([^:]*?)(?=\s*(?:Email|Phone|Phone Number|Year|Make|Model|Part|Good Luck|©|50 Stars)|$)/i,
    email: /(?:Email|Email Address)[\s:]+([^\s:<>]+@[^\s:<>]+(?:\.[^\s:<>]+)*)(?=\s*(?:Phone|Phone Number|Year|Make|Model|Part|Good Luck|©|50 Stars)|$)/i,
    phone: /(?:Phone|Telephone|Phone Number)[\s:]+([+\d\s\-()]+?)(?=\s*(?:Year|Make|Model|Part|Email|Good Luck|©|50 Stars)|$)/i,
    year: /(?:Year)[\s:]+(\d{4})(?=\s*(?:Make|Model|Part|Email|Phone|Good Luck|©|50 Stars)|$)/i,
    makeAndModel: /(?:Make\s*[&]?\s*Model|Make and Model)[\s:]+([^:]*?)(?=\s*(?:Part Required|Part|Year|Email|Phone|Good Luck|©|50 Stars)|$)/i,
    make: /(?:^|\s)(?:Make)[\s:]+([^:&]*?)(?=\s*(?:Model|Part|Year|Email|Phone|Good Luck|©|50 Stars)|$)/i,
    model: /(?:^|\s)(?:Model)[\s:]+([^:]*?)(?=\s*(?:Part|Year|Make|Email|Phone|Good Luck|©|50 Stars)|$)/i,
    partRequired: /(?:Part Required|Part Needed)[\s:]+([^:]*?)(?=\s*(?:Name|Email|Phone|Phone Number|Year|Make|Model|Offer|Offer Selected|Good Luck|©|50 Stars|Prolane|Pro\s*Lane|Prolane Auto Parts|@media|\n\n|\r\n\r\n)|$)/i,
  };

  for (const [key, pattern] of Object.entries(patterns)) {
    if (key === "partRequired") {
      const allMatches = [
        ...textContent.matchAll(new RegExp(pattern.source, pattern.flags + "g")),
      ];
      if (allMatches.length > 0) {
        const match = allMatches[allMatches.length - 1];
        if (match && match[1]) {
          let value = match[1].trim();
          const endPhrases = [
            "Offer",
            "Offer Selected",
            "Good Luck",
            "©",
            "50 Stars",
            "Prolane Auto Parts",
            "Pro Lane",
            "Prolane",
            "Auto Parts",
            "@media",
          ];
          for (const phrase of endPhrases) {
            const idx = value.toLowerCase().indexOf(phrase.toLowerCase());
            if (idx > 0) {
              value = value.substring(0, idx).trim();
            }
          }
          value = value.replace(/\s+/g, " ").replace(/[.\s]+$/, "").trim();
          if (
            value.toLowerCase().includes("50 stars auto parts") ||
            value.toLowerCase().includes("prolane auto parts") ||
            value.toLowerCase().includes("new lead")
          ) {
            const lastPartRequired = value.toLowerCase().lastIndexOf("part required:");
            if (lastPartRequired > 0) {
              value = value.substring(lastPartRequired + "part required:".length).trim();
            }
            const actualPartMatch = value.match(
              /([^:]+?)(?:\s*(?:Email|Phone|Year|Make|Model|Offer|Good Luck|©|50 Stars))/i
            );
            if (actualPartMatch) {
              value = actualPartMatch[1].trim();
            }
          }
          if (value) {
            fields[key] = value;
          }
        }
      }
    } else {
      const match = textContent.match(pattern);
      if (match && match[1]) {
        let value = match[1].trim();
        const endPhrases = [
          "Offer",
          "Offer Selected",
          "Good Luck",
          "©",
          "50 Stars",
          "Prolane Auto Parts",
          "Pro Lane",
          "Prolane",
          "Auto Parts",
          "@media",
        ];
        for (const phrase of endPhrases) {
          const idx = value.toLowerCase().indexOf(phrase.toLowerCase());
          if (idx > 0) {
            value = value.substring(0, idx).trim();
          }
        }
        value = value.replace(/\s+/g, " ").replace(/[.\s]+$/, "").trim();
        if (value) {
          fields[key] = value;
        }
      }
    }
  }

  /** Common inbox/snippet format: "{Part} - New Lead - Prolane …" / "50 Stars …" */
  if (!fields.partRequired) {
    const leadLine = textContent.match(
      /\b([A-Za-z0-9&][A-Za-z0-9\s&'./-]{0,80}?)\s*-\s*New Lead\s*-\s*(?:Prolane|Pro\s*Lane|50\s*Stars|50STARS|50\s*Stars\s*Auto)/i
    );
    if (leadLine && leadLine[1]) {
      let v = leadLine[1].replace(/\s+/g, " ").trim();
      if (v.length >= 2 && v.length < 90) fields.partRequired = v;
    }
  }

  if (fields.makeAndModel && !fields.make && !fields.model) {
    const parts = fields.makeAndModel.trim().split(/\s+/);
    if (parts.length >= 2) {
      fields.make = parts[0];
      fields.model = parts.slice(1).join(" ");
    } else {
      fields.make = fields.makeAndModel;
    }
    delete fields.makeAndModel;
  }

  function cleanFieldValue(value) {
    if (!value) return "";
    let cleaned = value.trim();
    const stopPatterns = [
      /\s*(?:Email|Phone|Phone Number|Year|Make|Model|Part Required|Part|Offer|Offer Selected|Good Luck|©|50 Stars|@media)/i,
      /\s+Email\s*:/i,
      /\s+Phone\s*:/i,
      /\s+Year\s*:/i,
      /\s+Make/i,
      /\s+Model\s*:/i,
      /\s+Part\s+Required\s*:/i,
      /\s+Offer\s*(?:Selected)?\s*:/i,
      /\s+Good\s+Luck/i,
      /\s*©/i,
      /\s*50\s+Stars/i,
      /\s*@media/i,
    ];

    for (const pattern of stopPatterns) {
      const m = cleaned.match(pattern);
      if (m && m.index > 0) {
        cleaned = cleaned.substring(0, m.index).trim();
      }
    }

    cleaned = cleaned.replace(/\s+/g, " ").replace(/[.\s]+$/, "").trim();
    return cleaned;
  }

  const labelValuePattern =
    /<(?:strong|b|label|td|th)[^>]*>([^<]+)<\/\w+>[\s:]*([^<\n]+)/gi;
  let match;
  while ((match = labelValuePattern.exec(html)) !== null) {
    const label = match[1].toLowerCase().trim();
    let value = cleanFieldValue(match[2]);

    if (label.includes("name") && !fields.name && value) fields.name = value;
    if (
      (label.includes("email") || label.includes("email address")) &&
      !fields.email &&
      value
    ) {
      const emailMatch = value.match(/([^\s<>]+@[^\s<>]+(?:\.[^\s<>]+)*)/);
      if (emailMatch) fields.email = emailMatch[1];
    }
    if (label.includes("phone") && !fields.phone && value) fields.phone = value;
    if (label.includes("year") && !fields.year && value) fields.year = value;
    if (
      (label.includes("make") && label.includes("model")) ||
      label.includes("make & model")
    ) {
      if (!fields.makeAndModel && value) fields.makeAndModel = value;
    } else if (label.includes("make") && !label.includes("model") && !fields.make && value) {
      fields.make = value;
    } else if (
      label.includes("model") &&
      !label.includes("make") &&
      !fields.model &&
      value
    ) {
      fields.model = value;
    }
    if (label.includes("part") && label.includes("required") && !fields.partRequired && value) {
      fields.partRequired = value;
    }
  }

  const tableRowPattern = /<td[^>]*>([^<]+)<\/td>\s*<td[^>]*>([^<]+)<\/td>/gi;
  while ((match = tableRowPattern.exec(html)) !== null) {
    const label = match[1].toLowerCase().trim();
    let value = cleanFieldValue(match[2]);

    if (label.includes("name") && !fields.name && value) fields.name = value;
    if (
      (label.includes("email") || label.includes("email address")) &&
      !fields.email &&
      value
    ) {
      const emailMatch = value.match(/([^\s<>]+@[^\s<>]+(?:\.[^\s<>]+)*)/);
      if (emailMatch) fields.email = emailMatch[1];
    }
    if (label.includes("phone") && !fields.phone && value) fields.phone = value;
    if (label.includes("year") && !fields.year && value) fields.year = value;
    if (
      (label.includes("make") && label.includes("model")) ||
      label.includes("make & model")
    ) {
      if (!fields.makeAndModel && value) fields.makeAndModel = value;
    } else if (label.includes("make") && !label.includes("model") && !fields.make && value) {
      fields.make = value;
    } else if (
      label.includes("model") &&
      !label.includes("make") &&
      !fields.model &&
      value
    ) {
      fields.model = value;
    }
    if (label.includes("part") && label.includes("required") && !fields.partRequired && value) {
      fields.partRequired = value;
    }
  }

  if (fields.makeAndModel && !fields.make && !fields.model) {
    const parts = fields.makeAndModel.trim().split(/\s+/);
    if (parts.length >= 2) {
      fields.make = parts[0];
      fields.model = parts.slice(1).join(" ");
    } else {
      fields.make = fields.makeAndModel;
    }
    delete fields.makeAndModel;
  }

  return fields;
}
