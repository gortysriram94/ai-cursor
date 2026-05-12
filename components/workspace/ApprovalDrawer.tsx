import React from "react";

export default function ApprovalDrawer() {
  return (
    <div className="fixed bottom-24 right-8 w-96 rounded-2xl border border-gray-200 bg-white shadow-xl z-50 hidden">
      <div className="p-5 border-b border-gray-200">
        <div className="text-sm font-medium text-gray-900">Approval Required</div>
        <div className="text-xs text-gray-500 mt-1">
          Review and approve before execution continues
        </div>
      </div>
      <div className="p-5">
        <div className="text-sm text-gray-600">No pending approvals</div>
      </div>
      <div className="p-4 border-t border-gray-200 flex justify-end gap-3">
        <button className="rounded-xl border border-gray-200 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
          Reject
        </button>
        <button className="rounded-xl bg-purple-600 text-white px-4 py-2 text-sm font-medium hover:bg-purple-700 transition-colors">
          Approve
        </button>
      </div>
    </div>
  );
}
