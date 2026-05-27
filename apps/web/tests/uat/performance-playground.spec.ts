/**
 * Manual UAT Catalog - Performance Playground
 * 
 * Human-readable validation cases for the Performance Playground surface.
 * These cases guide browser-based review; they are not an automated test suite.
 * 
 * Test Categories:
 * 1. Page Load & Navigation
 * 2. KPI Strip Display
 * 3. Service Activity Cards
 * 4. Scenario Selection & Control
 * 5. Request Flow Visualization
 * 6. Future Integration Panel
 * 7. Animation Toggle
 * 8. Responsive Layout
 * 9. Accessibility
 * 10. Cross-page Navigation
 */

export const UAT_TESTS = {
  // =========================================================================
  // 1. PAGE LOAD & NAVIGATION
  // =========================================================================
  'TC001_PageLoad': {
    name: 'Performance Playground loads correctly',
    steps: [
      'Navigate to /performance',
      'Wait for page to load completely',
      'Verify page title "Performance Playground" is visible',
      'Verify "Mock Data" badge is displayed',
      'Verify no loading spinner persists',
    ],
    expected: 'Page loads with all components visible and active scenario running',
  },

  'TC002_NavigationFromNav': {
    name: 'Navigate to Performance via AppShell',
    steps: [
      'Navigate to home page /',
      'Find and click "Performance" link in navigation',
      'Wait for page transition',
    ],
    expected: 'Performance Playground page is displayed',
  },

  // =========================================================================
  // 2. KPI STRIP DISPLAY
  // =========================================================================
  'TC010_KPIStripVisible': {
    name: 'KPI Strip shows all metrics',
    steps: [
      'Navigate to /performance',
      'Locate KPI strip at top of content',
      'Verify "Scenario" label and value visible',
      'Verify "Virtual Users" metric visible',
      'Verify "req/s" metric visible',
      'Verify "p95 Latency" metric visible',
      'Verify "Error Rate" metric visible',
      'Verify "Success" metric visible',
    ],
    expected: 'All 6 KPI metrics displayed with numeric values',
  },

  'TC011_KPIStripUpdates': {
    name: 'KPI values update live',
    steps: [
      'Navigate to /performance',
      'Note current req/s value',
      'Wait 2 seconds',
      'Check if req/s value has changed',
    ],
    expected: 'KPI values fluctuate as mock data updates',
  },

  // =========================================================================
  // 3. SERVICE ACTIVITY CARDS
  // =========================================================================
  'TC020_ServiceCardsVisible': {
    name: 'All 6 service cards are visible',
    steps: [
      'Navigate to /performance',
      'Locate "Service Activity" section',
      'Verify BFF Gateway card exists',
      'Verify Catalog card exists',
      'Verify Cart card exists',
      'Verify Checkout card exists',
      'Verify Orders card exists',
      'Verify Persistence card exists',
    ],
    expected: 'All 6 service cards displayed in grid layout',
  },

  'TC021_ServiceCardMetrics': {
    name: 'Service cards show correct metrics',
    steps: [
      'Navigate to /performance',
      'Select any service card (e.g., Catalog)',
      'Verify "req/s" metric shown',
      'Verify "p95" latency shown',
      'Verify "errors" rate shown',
      'Verify "conns" (connections) shown',
      'Verify "Pressure" bar shown',
    ],
    expected: 'Each card shows 4 metrics plus pressure bar',
  },

  'TC022_ServiceHealthBadges': {
    name: 'Service cards show health badges',
    steps: [
      'Navigate to /performance',
      'For each service card, verify health badge present',
      'Badge should show one of: Healthy, Degraded, Critical, Idle',
    ],
    expected: 'All cards show colored health status badges',
  },

  // =========================================================================
  // 4. SCENARIO SELECTION & CONTROL
  // =========================================================================
  'TC030_ScenarioListVisible': {
    name: 'All 6 scenarios are listed',
    steps: [
      'Navigate to /performance',
      'Locate "Performance Scenarios" panel',
      'Verify "Browsing Load" scenario visible',
      'Verify "Checkout Spike" scenario visible',
      'Verify "Mixed User Journey" scenario visible',
      'Verify "Catalog Stress" scenario visible',
      'Verify "Order Lookup Pressure" scenario visible',
      'Verify "Error Injection" scenario visible',
    ],
    expected: 'All 6 scenarios displayed with names and badges',
  },

  'TC031_ScenarioIntensityBadges': {
    name: 'Scenarios show intensity badges',
    steps: [
      'Navigate to /performance',
      'Verify each scenario has intensity badge (Low/Medium/High/Stress)',
      'Verify badges are color-coded',
    ],
    expected: 'Intensity badges visible with appropriate colors',
  },

  'TC032_StartScenario': {
    name: 'Start a different scenario',
    steps: [
      'Navigate to /performance',
      'Note current active scenario',
      'Click on "Checkout Spike" scenario card',
      'Wait for state update',
      'Verify KPI shows "Checkout Spike" as active',
      'Verify service cards update (Checkout shows activity)',
    ],
    expected: 'New scenario starts and UI reflects the change',
  },

  'TC033_StopScenario': {
    name: 'Stop active scenario',
    steps: [
      'Navigate to /performance',
      'Verify a scenario is running',
      'Click the Stop button on active scenario',
      'Wait for state update',
      'Verify KPI shows "Idle"',
      'Verify service cards show reduced/zero activity',
    ],
    expected: 'Scenario stops and system returns to idle state',
  },

  'TC034_ScenarioStats': {
    name: 'Scenario cards show VUs, req/s, duration',
    steps: [
      'Navigate to /performance',
      'For any scenario card, verify:',
      '- VUs (Virtual Users) stat visible',
      '- req/s stat visible',
      '- dur (duration) stat visible',
    ],
    expected: 'Each scenario shows 3 stats with icons',
  },

  // =========================================================================
  // 5. REQUEST FLOW VISUALIZATION
  // =========================================================================
  'TC040_RequestFlowVisible': {
    name: 'Request Flow diagram displays',
    steps: [
      'Navigate to /performance',
      'Locate "Request Flow" section',
      'Verify "Users" node visible',
      'Verify "BFF Gateway" node visible',
      'Verify service nodes (Catalog, Cart, etc.) visible',
      'Verify "Persistence" node visible',
    ],
    expected: 'Flow diagram shows complete request path',
  },

  'TC041_RequestFlowMetrics': {
    name: 'Request Flow shows traffic metrics',
    steps: [
      'Navigate to /performance',
      'Ensure a scenario is running',
      'Check flow connections show req/s values',
      'Check flow connections show latency values',
    ],
    expected: 'Flow diagram displays request rate and latency per path',
  },

  // =========================================================================
  // 6. FUTURE INTEGRATION PANEL
  // =========================================================================
  'TC050_FuturePanelCollapsed': {
    name: 'Future Integration panel is collapsible',
    steps: [
      'Navigate to /performance',
      'Locate "Potential Data Adapters" panel',
      'Verify panel header visible with "Mock Data" badge',
      'Verify panel is collapsed by default',
    ],
    expected: 'Panel header visible, content hidden',
  },

  'TC051_FuturePanelExpand': {
    name: 'Expand Future Integration panel',
    steps: [
      'Navigate to /performance',
      'Click on "Potential Data Adapters" header',
      'Wait for animation',
      'Verify "Current State" section visible',
      'Verify "Future Options" cards visible',
      'Verify "Candidate Inputs" list visible',
      'Verify "Current Frontend Boundary" block visible',
    ],
    expected: 'Panel expands to show all integration details',
  },

  'TC052_FuturePanelCollapse': {
    name: 'Collapse Future Integration panel',
    steps: [
      'Navigate to /performance',
      'Expand the panel if collapsed',
      'Click header again to collapse',
      'Verify content is hidden',
    ],
    expected: 'Panel collapses and content is hidden',
  },

  // =========================================================================
  // 7. ANIMATION TOGGLE
  // =========================================================================
  'TC060_AnimationToggleVisible': {
    name: 'Animation toggle button visible',
    steps: [
      'Navigate to /performance',
      'Locate "Animations On/Off" button near Service Activity header',
      'Verify button shows current state',
    ],
    expected: 'Animation toggle button visible and clickable',
  },

  'TC061_AnimationToggleOff': {
    name: 'Turn off animations',
    steps: [
      'Navigate to /performance',
      'If animations are on, click toggle to turn off',
      'Verify button shows "Animations Off"',
      'Verify service card pulse effects stop',
      'Verify request flow dots stop animating',
    ],
    expected: 'All animations pause/stop',
  },

  'TC062_AnimationToggleOn': {
    name: 'Turn on animations',
    steps: [
      'Navigate to /performance',
      'If animations are off, click toggle to turn on',
      'Verify button shows "Animations On"',
      'Verify service cards pulse',
      'Verify request flow shows animated dots',
    ],
    expected: 'All animations resume',
  },

  // =========================================================================
  // 8. RESPONSIVE LAYOUT
  // =========================================================================
  'TC070_DesktopLayout': {
    name: 'Desktop layout (1440px)',
    steps: [
      'Set viewport to 1440x900',
      'Navigate to /performance',
      'Verify KPI strip is horizontal',
      'Verify service cards in 3-column grid',
      'Verify scenario panel in right sidebar',
    ],
    expected: '3-column grid layout with sidebar',
  },

  'TC071_TabletLayout': {
    name: 'Tablet layout (768px)',
    steps: [
      'Set viewport to 768x1024',
      'Navigate to /performance',
      'Verify service cards in 2-column grid',
      'Verify content stacks appropriately',
    ],
    expected: '2-column grid, panels stack vertically',
  },

  'TC072_MobileLayout': {
    name: 'Mobile layout (375px)',
    steps: [
      'Set viewport to 375x667',
      'Navigate to /performance',
      'Verify service cards in 1-column',
      'Verify KPI strip wraps appropriately',
      'Verify all content is accessible by scrolling',
    ],
    expected: 'Single column layout, all content accessible',
  },

  // =========================================================================
  // 9. ACCESSIBILITY
  // =========================================================================
  'TC080_KeyboardNavigation': {
    name: 'Keyboard navigation works',
    steps: [
      'Navigate to /performance',
      'Press Tab to move through interactive elements',
      'Verify scenario buttons are focusable',
      'Verify animation toggle is focusable',
      'Verify future panel toggle is focusable',
      'Press Enter/Space on focused scenario to activate',
    ],
    expected: 'All interactive elements keyboard accessible',
  },

  'TC081_AriaLabels': {
    name: 'ARIA labels present',
    steps: [
      'Navigate to /performance',
      'Inspect scenario buttons for aria-label/aria-pressed',
      'Inspect health badges for role="status" or aria-label',
      'Inspect loading state for role="status"',
    ],
    expected: 'Key elements have appropriate ARIA attributes',
  },

  'TC082_ColorNotOnlyIndicator': {
    name: 'Status not only indicated by color',
    steps: [
      'Navigate to /performance',
      'Verify health badges show text (Healthy/Degraded/etc)',
      'Verify intensity badges show text (Low/Medium/etc)',
      'Verify KPI values show numbers, not just colors',
    ],
    expected: 'All status information has text labels, not just color',
  },

  // =========================================================================
  // 10. CROSS-PAGE NAVIGATION
  // =========================================================================
  'TC090_MockBoundaryDisclosure': {
    name: 'Potential adapters remain clearly non-live',
    steps: [
      'Navigate to /performance',
      'Expand Potential Data Adapters panel',
      'Verify the current state says metrics are simulated',
      'Verify candidate input text does not claim a live connection',
    ],
    expected: 'The page clearly separates mock data from future adapters',
  },

  'TC091_ReturnFromVisualizer': {
    name: 'Return to Performance from other pages',
    steps: [
      'Navigate to /visualizer',
      'Click "Performance" in navigation',
      'Verify return to /performance page',
    ],
    expected: 'Navigation back to Performance works',
  },

  'TC092_DevPagePerformanceLink': {
    name: 'Dev page links to Performance',
    steps: [
      'Navigate to /dev',
      'Find "Performance Playground" panel',
      'Click "Open Performance Playground" button',
      'Verify navigation to /performance',
    ],
    expected: 'Dev page successfully links to Performance Playground',
  },
};

// Helpers for a future manual-review harness.
export function getTestSteps(testId: keyof typeof UAT_TESTS) {
  return UAT_TESTS[testId];
}

export function getAllTestIds() {
  return Object.keys(UAT_TESTS);
}
