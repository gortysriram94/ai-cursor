// app/chat/components/RealTimeCostTracker.tsx
// Shows actual cost accumulating during AI Vision execution

'use client';

import { useEffect, useState } from 'react';

interface CostUpdate {
  visionCalls: number;
  screenshots: number;
  actualCost: number;
  estimatedTotal: number;
  slaveId?: string;
  slaveName?: string;
}

interface RealTimeCostTrackerProps {
  taskId: string;
  estimatedCost: number;
  userPays: number;
}

export function RealTimeCostTracker({ 
  taskId, 
  estimatedCost, 
  userPays 
}: RealTimeCostTrackerProps) {
  const [costData, setCostData] = useState<CostUpdate>({
    visionCalls: 0,
    screenshots: 0,
    actualCost: 0,
    estimatedTotal: estimatedCost
  });
  
  const [isExecuting, setIsExecuting] = useState(false);

  useEffect(() => {
    // Listen for cost updates via WebSocket or SSE
    const eventSource = new EventSource(`/api/cost-updates?taskId=${taskId}`);
    
    eventSource.onmessage = (event) => {
      const update: CostUpdate = JSON.parse(event.data);
      setCostData(update);
      setIsExecuting(true);
    };
    
    eventSource.addEventListener('complete', () => {
      setIsExecuting(false);
      eventSource.close();
    });
    
    eventSource.onerror = () => {
      setIsExecuting(false);
      eventSource.close();
    };
    
    return () => {
      eventSource.close();
    };
  }, [taskId]);

  const profit = userPays - costData.actualCost;
  const profitMargin = ((profit / userPays) * 100).toFixed(0);
  
  const costPercentage = (costData.actualCost / estimatedCost) * 100;
  const isOverBudget = costData.actualCost > estimatedCost;

  return (
    <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-lg p-4 border border-slate-700">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${isExecuting ? 'bg-green-500 animate-pulse' : 'bg-slate-500'}`} />
          <h3 className="text-sm font-medium text-slate-200">
            {isExecuting ? 'Task Running' : 'Task Complete'}
          </h3>
        </div>
        {costData.slaveName && (
          <span className="text-xs text-slate-400">
            {costData.slaveName}
          </span>
        )}
      </div>

      {/* Cost Breakdown */}
      <div className="space-y-2 mb-4">
        <div className="flex justify-between text-sm">
          <span className="text-slate-400">Vision API Calls:</span>
          <span className="text-slate-200 font-mono">
            {costData.visionCalls} × $0.002
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-slate-400">Screenshots:</span>
          <span className="text-slate-200 font-mono">
            {costData.screenshots} × $0.001
          </span>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="mb-4">
        <div className="flex justify-between text-xs text-slate-400 mb-1">
          <span>Actual Cost</span>
          <span>{costPercentage.toFixed(0)}% of estimate</span>
        </div>
        <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
          <div 
            className={`h-full transition-all duration-300 ${
              isOverBudget 
                ? 'bg-red-500' 
                : costPercentage > 80 
                ? 'bg-yellow-500' 
                : 'bg-green-500'
            }`}
            style={{ width: `${Math.min(costPercentage, 100)}%` }}
          />
        </div>
      </div>

      {/* Cost Summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-slate-800/50 rounded p-2">
          <div className="text-xs text-slate-400 mb-1">Actual Cost</div>
          <div className="text-lg font-bold text-slate-100 font-mono">
            ${costData.actualCost.toFixed(2)}
          </div>
        </div>
        
        <div className="bg-slate-800/50 rounded p-2">
          <div className="text-xs text-slate-400 mb-1">You Pay</div>
          <div className="text-lg font-bold text-blue-400 font-mono">
            ${userPays.toFixed(2)}
          </div>
        </div>
        
        <div className="bg-slate-800/50 rounded p-2">
          <div className="text-xs text-slate-400 mb-1">Profit</div>
          <div className="text-lg font-bold text-green-400 font-mono">
            ${profit.toFixed(2)}
          </div>
        </div>
      </div>

      {/* Profit Margin */}
      <div className="mt-3 text-center">
        <span className="text-xs text-slate-400">Profit Margin: </span>
        <span className="text-sm font-bold text-green-400">
          {profitMargin}%
        </span>
      </div>

      {/* Over Budget Warning */}
      {isOverBudget && (
        <div className="mt-3 bg-red-500/10 border border-red-500/30 rounded p-2">
          <p className="text-xs text-red-400">
            ⚠️ Cost exceeded estimate by ${(costData.actualCost - estimatedCost).toFixed(2)}
          </p>
        </div>
      )}
    </div>
  );
}
