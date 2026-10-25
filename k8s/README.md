# Deploy to Kubernetes
# 1. Build images (or use registry)
#    docker build -t servicedesk-api:latest ./server
#    docker build -t servicedesk-frontend:latest .
#
# 2. Apply namespace, config and infrastructure
#    kubectl apply -f k8s/namespace.yaml
#    kubectl apply -f k8s/api-config.yaml
#    kubectl apply -f k8s/mysql.yaml
#    kubectl apply -f k8s/redis.yaml
#
# 3. Apply schema migrations (one-shot Job; схема приходит из миграций, не из seed.sql)
#    kubectl delete job api-migrate -n servicedesk --ignore-not-found
#    kubectl apply -f k8s/migrate-job.yaml
#    kubectl wait --for=condition=complete --timeout=300s job/api-migrate -n servicedesk
#
# 4. Apply API and frontend
#    kubectl apply -f k8s/api.yaml
#    kubectl apply -f k8s/frontend.yaml
#
# 5. Wait for rollout
#    kubectl wait --for=condition=available --timeout=300s deployment/api -n servicedesk
#    kubectl wait --for=condition=available --timeout=300s deployment/frontend -n servicedesk
#
# 6. Verify
#    kubectl get pods -n servicedesk
#    kubectl get svc -n servicedesk
