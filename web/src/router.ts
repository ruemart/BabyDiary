import { createRouter, createWebHistory, type RouteRecordRaw } from "vue-router";

const routes: RouteRecordRaw[] = [
  { path: "/", name: "heute", component: () => import("./views/TodayView.vue") },
  { path: "/wochen", name: "wochen", component: () => import("./views/WeeksView.vue") },
  { path: "/kurven", name: "kurven", component: () => import("./views/ChartsView.vue") },
  { path: "/verlauf", name: "verlauf", component: () => import("./views/HistoryView.vue") },
  {
    path: "/einstellungen",
    name: "einstellungen",
    component: () => import("./views/SettingsView.vue"),
  },
  // Der Einladungs-Link landet hier: /start?t=<token>
  { path: "/start", name: "start", component: () => import("./views/JoinView.vue") },
  { path: "/:pathMatch(.*)*", redirect: "/" },
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 }),
});
