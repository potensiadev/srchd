"use client";

// 고정된 높이 배열 (렌더링 순수성 보장)
const BAR_HEIGHTS_PRIMARY = [72, 45, 88, 55, 68, 80];
const BAR_HEIGHTS_SECONDARY = [38, 52, 28, 45, 35, 48];

export function ChartSkeleton() {
    return (
        <div className="p-6 rounded-2xl bg-white border border-gray-100 shadow-sm animate-pulse">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <div className="w-24 h-6 bg-gray-100 rounded mb-2" />
                    <div className="w-40 h-4 bg-gray-100 rounded" />
                </div>
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-gray-100" />
                        <div className="w-16 h-3 bg-gray-100 rounded" />
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-gray-100" />
                        <div className="w-16 h-3 bg-gray-100 rounded" />
                    </div>
                </div>
            </div>

            <div className="flex items-end justify-between gap-4 h-40">
                {BAR_HEIGHTS_PRIMARY.map((primaryHeight, i) => (
                    <div key={i} className="flex-1 flex flex-col items-center gap-2">
                        <div className="flex-1 w-full flex items-end justify-center gap-1">
                            <div
                                className="w-5 bg-gray-100 rounded-t"
                                style={{ height: `${primaryHeight}%` }}
                            />
                            <div
                                className="w-5 bg-gray-100 rounded-t"
                                style={{ height: `${BAR_HEIGHTS_SECONDARY[i]}%` }}
                            />
                        </div>
                        <div className="w-8 h-3 bg-gray-100 rounded" />
                    </div>
                ))}
            </div>

            <div className="mt-6 pt-4 border-t border-gray-100 grid grid-cols-2 gap-4">
                <div>
                    <div className="w-24 h-4 bg-gray-100 rounded mb-2" />
                    <div className="w-16 h-6 bg-gray-100 rounded" />
                </div>
                <div>
                    <div className="w-20 h-4 bg-gray-100 rounded mb-2" />
                    <div className="w-12 h-6 bg-gray-100 rounded" />
                </div>
            </div>
        </div>
    );
}

export function PositionHealthSkeleton() {
    return (
        <div className="p-6 rounded-2xl bg-white border border-gray-100 shadow-sm animate-pulse">
            <div className="flex items-center justify-between mb-4">
                <div>
                    <div className="w-28 h-6 bg-gray-100 rounded mb-2" />
                    <div className="w-36 h-4 bg-gray-100 rounded" />
                </div>
            </div>

            <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                    <div key={i} className="p-3 rounded-xl border border-gray-100 bg-gray-50/50">
                        <div className="flex items-start justify-between">
                            <div className="flex-1">
                                <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full bg-gray-200" />
                                    <div className="w-32 h-5 bg-gray-100 rounded" />
                                </div>
                                <div className="w-24 h-3 bg-gray-100 rounded mt-2 ml-4" />
                            </div>
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-4 bg-gray-100 rounded" />
                                <div className="w-12 h-5 bg-gray-100 rounded-full" />
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

export function ActivitySkeleton() {
    return (
        <div className="p-6 rounded-2xl bg-white border border-gray-100 shadow-sm animate-pulse">
            <div className="flex items-center justify-between mb-4">
                <div>
                    <div className="w-24 h-6 bg-gray-100 rounded mb-2" />
                    <div className="w-32 h-4 bg-gray-100 rounded" />
                </div>
                <div className="w-5 h-5 bg-gray-100 rounded" />
            </div>

            <div className="space-y-3">
                {[...Array(4)].map((_, i) => (
                    <div key={i} className="flex gap-3">
                        <div className="flex flex-col items-center">
                            <div className="w-8 h-8 rounded-full bg-gray-100" />
                            {i < 3 && <div className="w-px h-8 bg-gray-200 my-1" />}
                        </div>
                        <div className="flex-1 pb-4">
                            <div className="w-full h-4 bg-gray-100 rounded mb-2" />
                            <div className="w-16 h-3 bg-gray-100 rounded" />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
