import { createRouter, createWebHistory } from "vue-router"
import ArchiveView from "@/views/ArchiveView.vue"

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: "/",
      name: "archive",
      component: ArchiveView,
    },
    {
      path: "/submit",
      name: "submit",
      component: () => import("@/views/SubmitView.vue"),
    },
    {
      path: "/admin/submissions",
      name: "admin-submissions",
      component: () => import("@/views/AdminSubmissionsView.vue"),
    },
    {
      path: "/articles",
      name: "articles",
      component: () => import("@/views/ArticlesView.vue"),
    },
    {
      path: "/local-cache",
      name: "local-cache",
      component: () => import("@/views/LocalCacheView.vue"),
    },
    {
      path: "/faq",
      name: "faq",
      component: () => import("@/views/FaqView.vue"),
    },
  ],
})

export default router
