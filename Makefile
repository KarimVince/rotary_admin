.PHONY: test test-backend test-frontend test-unit test-integration

test: test-backend test-frontend

test-backend:
	cd backend && venv/bin/pytest

test-frontend:
	cd frontend && npm run test

test-unit:
	cd backend && venv/bin/pytest -m unit

test-integration:
	cd backend && venv/bin/pytest -m integration
