import { get, set, del } from "idb-keyval";

export const storeDataset = async (id: string, data: string): Promise<void> => {
  await set("tl_" + id, data);
};

export const getDataset = async (id: string): Promise<string | undefined> => {
  return await get("tl_" + id);
};

export const clearDataset = async (id: string): Promise<void> => {
  await del("tl_" + id);
};
