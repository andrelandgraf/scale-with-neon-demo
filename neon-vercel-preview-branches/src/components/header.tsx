"use client";

import { ModeToggle } from "@/components/theme-toggle";

export function Header() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-gray-200 dark:border-gray-800 bg-white/80 dark:bg-gray-950/80 backdrop-blur-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center">
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
              Contacts App
            </h1>
          </div>
          <nav className="flex items-center space-x-4">
            <ModeToggle />
          </nav>
        </div>
      </div>
    </header>
  );
}
