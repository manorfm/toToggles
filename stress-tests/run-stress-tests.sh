#!/bin/bash

# ToToggle Stress Test Runner
# This script runs comprehensive stress tests against the ToToggle server

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SERVER_URL=${SERVER_URL:-"http://localhost:3056"}
SDK_GO_URL=${SDK_GO_URL:-"http://127.0.0.1:19091"}
SDK_NODE_URL=${SDK_NODE_URL:-"http://127.0.0.1:19092"}
SDK_JAVA_URL=${SDK_JAVA_URL:-"http://127.0.0.1:19093"}
MAX_USERS=${MAX_USERS:-1000}
TEST_DURATION=${TEST_DURATION:-300}
RAMP_UP_DURATION=${RAMP_UP_DURATION:-60}
REPORT_DIR="reports"
LOG_FILE="stress-test.log"

echo -e "${BLUE}🚀 ToToggle Stress Test Suite${NC}"
echo -e "${BLUE}================================${NC}"
echo "Server URL: $SERVER_URL"
echo "Max Users: $MAX_USERS"
echo "Test Duration: ${TEST_DURATION}s"
echo "Ramp Up Duration: ${RAMP_UP_DURATION}s"
echo ""

# Stress tests must not accidentally target a remote system. A remote target needs an
# explicit operator acknowledgement; this also prevents credentials or test data from
# being sent to an unintended host.
stress_require_safe_target() {
    local target_url=$1
    local target_name=$2
    local target_host

    if [[ ! "$target_url" =~ ^https?://[^/@]+(/|$) ]]; then
        echo -e "${RED}❌ $target_name URL must be an absolute HTTP(S) URL without user credentials${NC}" >&2
        return 1
    fi

    target_host=${target_url#http://}
    target_host=${target_host#https://}
    target_host=${target_host%%/*}
    target_host=${target_host%%:*}
    if [[ "$target_url" == http://\[* || "$target_url" == https://\[* ]]; then
        target_host=${target_url#http://[}
        target_host=${target_host#https://[}
        target_host=${target_host%%]*}
    fi

    case "$target_host" in
        localhost|127.0.0.1|::1|0:0:0:0:0:0:0:1)
            return 0
            ;;
    esac

    if [[ "${ALLOW_NON_LOOPBACK_STRESS_TARGETS:-}" == "yes" ]]; then
        return 0
    fi

    echo -e "${RED}❌ Refusing to target non-loopback $target_name: $target_url${NC}" >&2
    echo "Set ALLOW_NON_LOOPBACK_STRESS_TARGETS=yes only after explicitly approving that target." >&2
    return 1
}

# Function to check if server is running
check_server() {
    echo -e "${YELLOW}🔍 Checking if ToToggle server is running...${NC}"
    
    if curl -s --fail "$SERVER_URL/health" > /dev/null 2>&1; then
        echo -e "${GREEN}✅ Server is running and healthy${NC}"
        return 0
    else
        echo -e "${RED}❌ Server is not responding at $SERVER_URL${NC}"
        echo -e "${YELLOW}💡 Make sure to start the ToToggle server before running stress tests${NC}"
        return 1
    fi
}

check_sidecar() {
    local sidecar_name=$1
    local sidecar_url=$2
    echo -e "${YELLOW}🔍 Checking $sidecar_name sidecar...${NC}"

    if curl -sS --fail --max-time 5 "$sidecar_url/health" > /dev/null; then
        echo -e "${GREEN}✅ $sidecar_name sidecar is healthy${NC}"
        return 0
    fi

    echo -e "${RED}❌ $sidecar_name sidecar is not responding at $sidecar_url/health${NC}"
    return 1
}

check_server_target() {
    stress_require_safe_target "$SERVER_URL" "ToToggle server" || return 1
    check_server || return 1
}

check_sdk_sidecars() {
    stress_require_safe_target "$SDK_GO_URL" "Go SDK sidecar" || return 1
    stress_require_safe_target "$SDK_NODE_URL" "Node SDK sidecar" || return 1
    stress_require_safe_target "$SDK_JAVA_URL" "Java SDK sidecar" || return 1
    check_sidecar "Go SDK" "$SDK_GO_URL" || return 1
    check_sidecar "Node SDK" "$SDK_NODE_URL" || return 1
    check_sidecar "Java SDK" "$SDK_JAVA_URL" || return 1
}

# Function to setup test data
setup_test_data() {
    echo -e "${YELLOW}📋 Setting up test data...${NC}"
    
    if ./gradlew setupTestData; then
        echo -e "${GREEN}✅ Test data setup completed${NC}"
        
        if [ -f "test-data.json" ]; then
            APPS_COUNT=$(grep -o '"name"' test-data.json | wc -l)
            echo -e "${BLUE}📊 Created $APPS_COUNT applications with toggles${NC}"
        fi
    else
        echo -e "${RED}❌ Failed to setup test data${NC}"
        exit 1
    fi
}

# Function to run a specific test simulation
run_simulation() {
    local simulation_name=$1
    local description=$2
    local extra_params=$3
    
    echo -e "${YELLOW}🎯 Running $description...${NC}"
    echo "Simulation: $simulation_name"
    echo "Parameters: $extra_params"
    echo ""
    
    local start_time=$(date +%s)
    
    if ./gradlew gatlingRun --non-interactive --simulation "$simulation_name" \
        -Dserver.url="$SERVER_URL" \
        -Dsdk.go.url="$SDK_GO_URL" \
        -Dsdk.node.url="$SDK_NODE_URL" \
        -Dsdk.java.url="$SDK_JAVA_URL" \
        -Dmax.users="$MAX_USERS" \
        -Dtest.duration="$TEST_DURATION" \
        -Dramp.up.duration="$RAMP_UP_DURATION" \
        $extra_params; then
        
        local end_time=$(date +%s)
        local duration=$((end_time - start_time))
        echo -e "${GREEN}✅ $description completed in ${duration}s${NC}"
        
        # Find and display the report path
        local report_path=$(find build/reports/gatling -name "index.html" -newer /tmp/stress_test_start 2>/dev/null | head -1)
        if [ -n "$report_path" ]; then
            echo -e "${BLUE}📊 Report available at: $report_path${NC}"
        fi
        
        return 0
    else
        echo -e "${RED}❌ $description failed${NC}"
        return 1
    fi
}

# Function to run all stress tests
run_all_tests() {
    echo -e "${YELLOW}🧪 Running comprehensive stress test suite...${NC}"
    echo ""
    
    # Create timestamp for report organization
    touch /tmp/stress_test_start
    
    # Test 1: Basic stress test
    run_simulation "simulations.ToToggleStressSimulation" "Basic Stress Test" ""
    
    echo -e "\n${BLUE}⏱️  Waiting 30 seconds between tests...${NC}\n"
    sleep 30
    
    # Test 2: Capacity test (different parameters)
    run_simulation "simulations.CapacityTestSimulation" "Capacity Test" \
        "-Dstart.users=10 -Dmax.users=1500 -Dstep.users=50 -Dstep.duration=30"
    
    echo -e "\n${BLUE}⏱️  Waiting 30 seconds between tests...${NC}\n"
    sleep 30
    
    # Test 3: Spike test
    run_simulation "simulations.SpikeTestSimulation" "Spike Test" \
        "-Dnormal.users=50 -Dspike.users=500 -Dnumber.spikes=5"
    
    rm -f /tmp/stress_test_start
}

# Function to generate summary report
generate_summary() {
    echo -e "${YELLOW}📈 Generating test summary...${NC}"
    
    local summary_file="stress-test-summary.md"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    
    cat > "$summary_file" << EOF
# ToToggle Stress Test Summary

**Date:** $timestamp  
**Server:** $SERVER_URL  
**Max Users:** $MAX_USERS  
**Test Duration:** ${TEST_DURATION}s  
**Ramp Up Duration:** ${RAMP_UP_DURATION}s  

## Test Results

EOF

    # Find all Gatling reports generated today
    find build/reports/gatling -name "index.html" -type f -mtime -1 2>/dev/null | while read report; do
        local test_name=$(basename $(dirname "$report"))
        echo "- [$test_name]($report)" >> "$summary_file"
    done

    cat >> "$summary_file" << EOF

## Key Metrics to Check

1. **Response Times:**
   - Mean response time < 500ms
   - 95th percentile < 1000ms
   - 99th percentile < 2000ms

2. **Success Rate:**
   - Should be > 99%
   - Failed requests < 1%

3. **Throughput:**
   - Requests per second under load
   - Server capacity limits

4. **Resource Usage:**
   - Check server CPU and memory during tests
   - Monitor for memory leaks

## Recommendations

- If response times exceed targets, consider server optimization
- If success rate drops below 99%, investigate error causes
- Use capacity test results to plan production scaling
- Monitor server resources during peak load

EOF

    echo -e "${GREEN}✅ Summary report generated: $summary_file${NC}"
}

# Function to cleanup
cleanup() {
    echo -e "${YELLOW}🧹 Cleaning up test data...${NC}"
    
    if [ -f "test-data.json" ]; then
        rm -f test-data.json
    fi
    
    if [ -f "gatling-test-data.json" ]; then
        rm -f gatling-test-data.json
    fi
    
    echo -e "${GREEN}✅ Cleanup completed${NC}"
}

require_sdk_fixture() {
    if [[ -f "test-data.json" ]]; then
        return 0
    fi
    echo -e "${RED}❌ SDK stress requires test-data.json created by './run-stress-tests.sh setup' before starting the sidecars${NC}" >&2
    return 1
}

# Function to show help
show_help() {
    echo "ToToggle Stress Test Runner"
    echo ""
    echo "Usage: $0 [OPTIONS] [COMMAND]"
    echo ""
    echo "Commands:"
    echo "  all          Run all stress tests (default)"
    echo "  basic        Run basic stress test only"
    echo "  capacity     Run capacity test only"
    echo "  spike        Run spike test only"
    echo "  sdk          Run contextual stress against Go, Node and Java sidecars"
    echo "  setup        Setup test data only"
    echo "  cleanup      Cleanup test data"
    echo "  help         Show this help"
    echo ""
    echo "Environment Variables:"
    echo "  SERVER_URL           ToToggle server URL (default: http://localhost:8080)"
    echo "  MAX_USERS           Maximum concurrent users (default: 1000)"
    echo "  TEST_DURATION       Test duration in seconds (default: 300)"
    echo "  RAMP_UP_DURATION    Ramp up duration in seconds (default: 60)"
    echo "  SDK_GO_URL          Go SDK sidecar URL (default: http://127.0.0.1:19091)"
    echo "  SDK_NODE_URL        Node SDK sidecar URL (default: http://127.0.0.1:19092)"
    echo "  SDK_JAVA_URL        Java SDK sidecar URL (default: http://127.0.0.1:19093)"
    echo "  ALLOW_NON_LOOPBACK_STRESS_TARGETS=yes  Explicitly acknowledge a non-loopback target"
    echo ""
    echo "Examples:"
    echo "  $0                                    # Run all tests"
    echo "  $0 basic                              # Run basic test only"
    echo "  $0 sdk                                # Run cross-SDK contextual stress"
    echo "  ALLOW_NON_LOOPBACK_STRESS_TARGETS=yes SERVER_URL=https://approved.example $0 sdk"
    echo "  MAX_USERS=2000 $0 capacity           # Capacity test with 2000 users"
}

# Main script logic
main() {
    local command=${1:-all}
    
    case $command in
        "help"|"-h"|"--help")
            show_help
            exit 0
            ;;
        "setup")
            check_server_target || exit 1
            setup_test_data
            exit 0
            ;;
        "cleanup")
            cleanup
            exit 0
            ;;
        "basic")
            check_server_target || exit 1
            setup_test_data
            run_simulation "simulations.ToToggleStressSimulation" "Basic Stress Test" ""
            generate_summary
            ;;
        "capacity")
            check_server_target || exit 1
            setup_test_data
            run_simulation "simulations.CapacityTestSimulation" "Capacity Test" \
                "-Dstart.users=10 -Dmax.users=1500 -Dstep.users=50"
            generate_summary
            ;;
        "spike")
            check_server_target || exit 1
            setup_test_data
            run_simulation "simulations.SpikeTestSimulation" "Spike Test" \
                "-Dnormal.users=50 -Dspike.users=500"
            generate_summary
            ;;
        "all")
            check_server_target || exit 1
            setup_test_data
            run_all_tests
            generate_summary
            ;;
        "sdk")
            check_server_target || exit 1
            require_sdk_fixture || exit 1
            check_sdk_sidecars || exit 1
            run_simulation "simulations.SdkContextStressSimulation" "Cross-SDK Context Stress Test" \
                "-Dsdk.users=$MAX_USERS -Dsdk.test.duration=$TEST_DURATION -Dsdk.ramp.up.duration=$RAMP_UP_DURATION"
            generate_summary
            ;;
        *)
            echo -e "${RED}❌ Unknown command: $command${NC}"
            echo "Use '$0 help' to see available commands"
            exit 1
            ;;
    esac
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
    # Start logging only for an executable run. Sourcing this script is used by the safety tests.
    exec > >(tee -a "$LOG_FILE")
    exec 2>&1
    echo "=== Stress Test Session Started: $(date) ===" >> "$LOG_FILE"
    main "$@"
    echo -e "\n${GREEN}🎉 Stress testing completed!${NC}"
    echo -e "${BLUE}📋 Full log available in: $LOG_FILE${NC}"
fi
