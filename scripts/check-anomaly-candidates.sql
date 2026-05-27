-- One-off diagnostic. Counts (vendor, product) pairs that appear across
-- multiple invoices in the last 60 days — those are the candidates the
-- anomaly detector can compare against each other.
-- Safe to run any time; read-only.

SELECT
  i.vendor_name_normalized,
  li.description_normalized,
  COUNT(*) AS occurrences,
  MIN(i.invoice_date) AS first_date,
  MAX(i.invoice_date) AS last_date,
  MIN(li.unit_price) AS min_unit_price,
  MAX(li.unit_price) AS max_unit_price
FROM public.invoice_line_items li
JOIN public.invoices i ON i.id = li.invoice_id
WHERE i.invoice_date >= NOW() - INTERVAL '60 days'
GROUP BY i.vendor_name_normalized, li.description_normalized
HAVING COUNT(*) > 1
ORDER BY occurrences DESC, last_date DESC
LIMIT 20;
