.DEFAULT_GOAL := dev

.PHONY: dev dev-backend dev-frontend

# Run both foreground servers concurrently; Ctrl+C stops development.
dev:
	$(MAKE) --no-print-directory -j2 dev-backend dev-frontend

dev-backend:
	python scripts/job_search_web.py

dev-frontend:
	npm run dev:frontend
